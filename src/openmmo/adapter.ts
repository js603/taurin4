import type { OpenMmoCodec } from "./codec";
import type { OpenMmoTransport } from "./transport";
import type {
  OpenMmoAdapterSnapshot,
  OpenMmoCharacter,
  OpenMmoCharacterClass,
  OpenMmoClientMessage,
  OpenMmoGender,
  OpenMmoServerMessage,
} from "./types";

export interface OpenMmoAdapterOptions {
  codec: OpenMmoCodec;
  transport: OpenMmoTransport;
  clientVersion?: string;
  requestTimeoutMs?: number;
}

type Result<T extends object = Record<string, never>> =
  | ({ ok: true } & T)
  | { ok: false; message: string };

type PendingRequest = {
  variants: ReadonlySet<string>;
  resolve: (message: OpenMmoServerMessage) => void;
  timer: ReturnType<typeof setTimeout>;
};

const INITIAL_SNAPSHOT: OpenMmoAdapterSnapshot = {
  phase: "idle",
  endpoint: null,
  accountName: null,
  characters: [],
  selectedCharacterId: null,
  lastError: null,
};

function variantOf(message: OpenMmoServerMessage): string {
  if (typeof message === "string") return message;
  if (!message || typeof message !== "object") return "Unknown";
  return Object.keys(message)[0] ?? "Unknown";
}

function payloadOf<T>(message: OpenMmoServerMessage, variant: string): T {
  return (message as Record<string, unknown>)[variant] as T;
}

export class OpenMmoAdapter {
  private snapshot: OpenMmoAdapterSnapshot = INITIAL_SNAPSHOT;
  private readonly listeners = new Set<() => void>();
  private readonly pending = new Set<PendingRequest>();
  private readonly codec: OpenMmoCodec;
  private readonly transport: OpenMmoTransport;
  private readonly clientVersion: string;
  private readonly requestTimeoutMs: number;
  private handshakeSent = false;

  constructor(options: OpenMmoAdapterOptions) {
    this.codec = options.codec;
    this.transport = options.transport;
    this.clientVersion = options.clientVersion ?? "idea2-m2/0.1.0";
    this.requestTimeoutMs = options.requestTimeoutMs ?? 8_000;
  }

  getSnapshot = () => this.snapshot;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  connect(endpoint: string) {
    this.disconnect(false);
    this.handshakeSent = false;
    this.update({
      ...INITIAL_SNAPSHOT,
      phase: "connecting",
      endpoint,
    });

    this.transport.connect(endpoint, {
      onOpen: () => {
        this.update({ ...this.snapshot, phase: "handshaking" });
        if (!this.sendHandshake()) {
          this.fail("Failed to send OpenMMO ClientInfo");
          return;
        }
        this.update({ ...this.snapshot, phase: "connected" });
      },
      onBinary: (bytes) => {
        try {
          this.handleServerMessage(this.codec.decodeServer(bytes));
        } catch (error) {
          this.fail(
            error instanceof Error
              ? "OpenMMO decode failed: " + error.message
              : "OpenMMO decode failed",
          );
        }
      },
      onClose: (code, reason) => {
        this.rejectPending(
          "OpenMMO connection closed (" +
            code +
            ")" +
            (reason ? ": " + reason : ""),
        );
        this.update({
          ...this.snapshot,
          phase: code === 1000 ? "closed" : "error",
          lastError:
            code === 1000
              ? this.snapshot.lastError
              : reason || "OpenMMO connection closed unexpectedly",
        });
      },
      onError: (message) => {
        this.update({ ...this.snapshot, lastError: message });
      },
    });
  }

  disconnect(updateSnapshot = true) {
    this.rejectPending("OpenMMO client disconnected");
    this.transport.close(1000, "idea2 disconnect");
    this.handshakeSent = false;
    if (updateSnapshot) {
      this.update({ ...INITIAL_SNAPSHOT, phase: "closed" });
    }
  }

  async authenticateNpc(
    accountName: string,
    npcToken: string,
  ): Promise<Result<{ accountName: string; characters: readonly OpenMmoCharacter[] }>> {
    const response = await this.request(
      ["AuthSuccess", "AuthError"],
      {
        AuthenticateNpc: {
          account_name: accountName,
          npc_token: npcToken,
        },
      },
    );

    const variant = variantOf(response);
    if (variant === "AuthError") {
      return {
        ok: false,
        message: payloadOf<{ message: string }>(response, variant).message,
      };
    }

    const payload = payloadOf<{
      account_name: string;
      characters: OpenMmoCharacter[];
    }>(response, variant);
    return {
      ok: true,
      accountName: payload.account_name,
      characters: payload.characters,
    };
  }

  async authenticateGoogle(
    googleIdToken: string,
  ): Promise<Result<{ accountName: string; characters: readonly OpenMmoCharacter[] }>> {
    const response = await this.request(
      ["AuthSuccess", "AuthError"],
      { Authenticate: { google_id_token: googleIdToken } },
    );

    const variant = variantOf(response);
    if (variant === "AuthError") {
      return {
        ok: false,
        message: payloadOf<{ message: string }>(response, variant).message,
      };
    }

    const payload = payloadOf<{
      account_name: string;
      characters: OpenMmoCharacter[];
    }>(response, variant);
    return {
      ok: true,
      accountName: payload.account_name,
      characters: payload.characters,
    };
  }

  async rollCharacterStats(
    characterClass: OpenMmoCharacterClass,
    gender: OpenMmoGender,
  ): Promise<
    Result<{
      attributes: OpenMmoCharacter["attributes"];
      maxHp: number;
    }>
  > {
    const response = await this.request(
      ["CharacterStatsRolled", "CharacterError", "AuthError"],
      {
        RollCharacterStats: {
          character_class: characterClass,
          gender,
        },
      },
    );

    const variant = variantOf(response);
    if (variant !== "CharacterStatsRolled") {
      return {
        ok: false,
        message: this.messageFromError(response, variant),
      };
    }

    const payload = payloadOf<{
      attributes: OpenMmoCharacter["attributes"];
      max_hp: number;
    }>(response, variant);
    return {
      ok: true,
      attributes: payload.attributes,
      maxHp: payload.max_hp,
    };
  }

  async createCharacter(
    name: string,
    characterClass: OpenMmoCharacterClass,
    gender: OpenMmoGender,
  ): Promise<Result<{ character: OpenMmoCharacter }>> {
    const response = await this.request(
      ["CharacterCreated", "CharacterError", "AuthError"],
      {
        CreateCharacter: {
          character_name: name,
          character_class: characterClass,
          gender,
        },
      },
    );

    const variant = variantOf(response);
    if (variant !== "CharacterCreated") {
      return { ok: false, message: this.messageFromError(response, variant) };
    }

    return {
      ok: true,
      character: payloadOf<{ character: OpenMmoCharacter }>(
        response,
        variant,
      ).character,
    };
  }

  async deleteCharacter(characterId: number): Promise<Result> {
    const response = await this.request(
      ["CharacterDeleted", "CharacterError", "AuthError"],
      { DeleteCharacter: { character_id: characterId } },
    );
    const variant = variantOf(response);
    if (variant !== "CharacterDeleted") {
      return { ok: false, message: this.messageFromError(response, variant) };
    }
    return { ok: true };
  }

  async renameCharacter(
    characterId: number,
    newName: string,
  ): Promise<Result<{ name: string }>> {
    const response = await this.request(
      ["CharacterRenamed", "CharacterError", "AuthError"],
      {
        RenameCharacter: {
          character_id: characterId,
          new_name: newName,
        },
      },
    );
    const variant = variantOf(response);
    if (variant !== "CharacterRenamed") {
      return { ok: false, message: this.messageFromError(response, variant) };
    }
    return {
      ok: true,
      name: payloadOf<{ character_id: number; name: string }>(
        response,
        variant,
      ).name,
    };
  }

  async enterGame(
    characterId: number,
  ): Promise<Result<{ renameRequired?: boolean }>> {
    this.update({
      ...this.snapshot,
      phase: "entering",
      selectedCharacterId: characterId,
      lastError: null,
    });

    const response = await this.request(
      [
        "JoinSuccess",
        "CharacterRenameRequired",
        "CharacterError",
        "AuthError",
      ],
      { EnterGame: { character_id: characterId } },
    );

    const variant = variantOf(response);
    if (variant === "CharacterRenameRequired") {
      this.update({ ...this.snapshot, phase: "authenticated" });
      return {
        ok: false,
        message: "Character rename required",
      };
    }

    if (variant !== "JoinSuccess") {
      this.update({ ...this.snapshot, phase: "authenticated" });
      return { ok: false, message: this.messageFromError(response, variant) };
    }

    if (!this.send("WorldReady")) {
      return { ok: false, message: "Failed to send WorldReady" };
    }

    this.update({ ...this.snapshot, phase: "in_game" });
    return { ok: true };
  }

  sendChat(message: string) {
    return this.send({ ChatMessage: { message } });
  }

  sendAttack(monsterId: string) {
    return this.send({ PlayerAttack: { monster_id: monsterId } });
  }

  requestRespawn() {
    return this.send("RequestRespawn");
  }

  private sendHandshake() {
    if (this.handshakeSent) return true;
    this.handshakeSent = true;
    return this.sendRaw({
      ClientInfo: {
        protocol_version: this.codec.protocolVersion(),
        client_kind: "web",
        client_version: this.codec.stampLayoutVersion(this.clientVersion),
      },
    });
  }

  private send(message: OpenMmoClientMessage) {
    if (!this.transport.isOpen()) return false;
    if (!this.handshakeSent && !this.sendHandshake()) return false;
    return this.sendRaw(message);
  }

  private sendRaw(message: OpenMmoClientMessage) {
    try {
      return this.transport.send(this.codec.encodeClient(message));
    } catch (error) {
      this.fail(
        error instanceof Error
          ? "OpenMMO encode failed: " + error.message
          : "OpenMMO encode failed",
      );
      return false;
    }
  }

  private request(
    variants: readonly string[],
    message: OpenMmoClientMessage,
  ): Promise<OpenMmoServerMessage> {
    if (!this.transport.isOpen()) {
      return Promise.resolve({
        AuthError: { message: "OpenMMO socket is not connected" },
      });
    }

    return new Promise((resolve) => {
      const pending: PendingRequest = {
        variants: new Set(variants),
        resolve,
        timer: setTimeout(() => {
          this.pending.delete(pending);
          resolve({
            AuthError: {
              message:
                "OpenMMO request timed out waiting for " + variants.join("/"),
            },
          });
        }, this.requestTimeoutMs),
      };

      this.pending.add(pending);
      if (!this.send(message)) {
        clearTimeout(pending.timer);
        this.pending.delete(pending);
        resolve({
          AuthError: { message: "Failed to send OpenMMO request" },
        });
      }
    });
  }

  private handleServerMessage(message: OpenMmoServerMessage) {
    const variant = variantOf(message);

    if (variant === "AuthSuccess") {
      const payload = payloadOf<{
        account_name: string;
        characters: OpenMmoCharacter[];
      }>(message, variant);
      this.update({
        ...this.snapshot,
        phase: "authenticated",
        accountName: payload.account_name,
        characters: payload.characters,
        lastError: null,
      });
    } else if (variant === "CharacterCreated") {
      const character = payloadOf<{ character: OpenMmoCharacter }>(
        message,
        variant,
      ).character;
      this.update({
        ...this.snapshot,
        characters: [
          ...this.snapshot.characters.filter((item) => item.id !== character.id),
          character,
        ],
      });
    } else if (variant === "CharacterDeleted") {
      const characterId = payloadOf<{ character_id: number }>(
        message,
        variant,
      ).character_id;
      this.update({
        ...this.snapshot,
        characters: this.snapshot.characters.filter(
          (item) => item.id !== characterId,
        ),
      });
    } else if (variant === "CharacterRenamed") {
      const payload = payloadOf<{ character_id: number; name: string }>(
        message,
        variant,
      );
      this.update({
        ...this.snapshot,
        characters: this.snapshot.characters.map((character) =>
          character.id === payload.character_id
            ? { ...character, name: payload.name }
            : character,
        ),
      });
    } else if (variant === "GameTimeSync") {
      this.send("Heartbeat");
    } else if (
      variant === "AuthError" ||
      variant === "CharacterError"
    ) {
      this.update({
        ...this.snapshot,
        lastError: this.messageFromError(message, variant),
      });
    }

    for (const pending of this.pending) {
      if (!pending.variants.has(variant)) continue;
      clearTimeout(pending.timer);
      this.pending.delete(pending);
      pending.resolve(message);
      break;
    }
  }

  private messageFromError(
    message: OpenMmoServerMessage,
    variant: string,
  ) {
    const payload = payloadOf<{ message?: string }>(message, variant);
    return payload?.message ?? variant;
  }

  private rejectPending(message: string) {
    for (const pending of this.pending) {
      clearTimeout(pending.timer);
      pending.resolve({ AuthError: { message } });
    }
    this.pending.clear();
  }

  private fail(message: string) {
    this.rejectPending(message);
    this.update({
      ...this.snapshot,
      phase: "error",
      lastError: message,
    });
  }

  private update(snapshot: OpenMmoAdapterSnapshot) {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener());
  }
}
