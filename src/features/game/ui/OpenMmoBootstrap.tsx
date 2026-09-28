import { useCallback, useEffect, useRef, useState } from "react";
import {
  isAndroidTauriRuntime,
  isTauriRuntime,
} from "../../../app/platformRuntime";
import { GameScreen } from "./GameScreen";
import { OpenMmoCharacterLobby } from "./OpenMmoCharacterLobby";
import { loadOpenMmoBrowserCodec } from "../../../openmmo/browserCodec";
import type { OpenMmoNativeLaunchConfig } from "../../../openmmo/nativeLaunch";
import {
  startOpenMmoEmbeddedHost,
  stopOpenMmoEmbeddedHost,
  type OpenMmoEmbeddedLaunchConfig,
} from "../../../openmmo/embeddedHost";
import {
  createOpenMmoRuntime,
  type OpenMmoRuntime,
} from "../../../openmmo/runtime";

type BootstrapPhase =
  | "setup"
  | "starting_embedded"
  | "loading_codec"
  | "connecting"
  | "authenticating"
  | "lobby"
  | "game"
  | "error";

function waitForConnected(runtime: OpenMmoRuntime, timeoutMs = 8_000) {
  if (runtime.adapter.getSnapshot().phase === "connected") {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      unsubscribe();
      reject(
        new Error(
          "OpenMMO connection timeout: " +
            JSON.stringify(runtime.adapter.getSnapshot()),
        ),
      );
    }, timeoutMs);

    const unsubscribe = runtime.adapter.subscribe(() => {
      const snapshot = runtime.adapter.getSnapshot();
      if (snapshot.phase === "connected") {
        window.clearTimeout(timer);
        unsubscribe();
        resolve();
      } else if (snapshot.phase === "error") {
        window.clearTimeout(timer);
        unsubscribe();
        reject(
          new Error(snapshot.lastError ?? "OpenMMO connection failed"),
        );
      }
    });
  });
}

export function OpenMmoBootstrap({
  nativeLaunchConfig,
}: {
  nativeLaunchConfig?: OpenMmoNativeLaunchConfig | null;
} = {}) {
  const params = new URLSearchParams(window.location.search);
  const nativeTauri = isTauriRuntime();
  const androidTauri = isAndroidTauriRuntime();
  const defaultServerUrl =
    nativeLaunchConfig?.serverUrl ??
    params.get("server") ??
    (androidTauri ? "" : "ws://127.0.0.1:10006");
  const [serverUrl, setServerUrl] = useState(defaultServerUrl);
  const [codecUrl, setCodecUrl] = useState(
    params.get("codec") ??
      import.meta.env.BASE_URL + "openmmo-wasm/onlinerpg_shared.js",
  );
  const [accountName, setAccountName] = useState(
    nativeLaunchConfig?.accountName ??
      params.get("account") ??
      "npc_idea2_player",
  );
  const [npcToken, setNpcToken] = useState(
    nativeLaunchConfig?.npcToken ?? "",
  );
  const [phase, setPhase] = useState<BootstrapPhase>("setup");
  const [error, setError] = useState<string | null>(null);
  const [runtime, setRuntime] = useState<OpenMmoRuntime | null>(null);
  const [embeddedLaunchConfig, setEmbeddedLaunchConfig] =
    useState<OpenMmoEmbeddedLaunchConfig | null>(null);
  const activeRuntime = useRef<OpenMmoRuntime | null>(null);
  const embeddedHostOwned = useRef(false);
  const nativeAutostartConsumed = useRef(false);

  const stopEmbeddedHost = useCallback(async () => {
    if (!embeddedHostOwned.current) return;

    try {
      await stopOpenMmoEmbeddedHost();
    } finally {
      embeddedHostOwned.current = false;
      setEmbeddedLaunchConfig(null);
    }
  }, []);

  const start = useCallback(async (
    launchConfig?: Pick<
      OpenMmoNativeLaunchConfig,
      "serverUrl" | "accountName" | "npcToken"
    >,
  ) => {
    const nextServerUrl = launchConfig?.serverUrl ?? serverUrl;
    const nextAccountName = launchConfig?.accountName ?? accountName;
    const nextNpcToken = launchConfig?.npcToken ?? npcToken;

    setError(null);

    let nextRuntime: OpenMmoRuntime | null = null;
    try {
      setPhase("loading_codec");
      const wasm = await loadOpenMmoBrowserCodec(codecUrl);

      nextRuntime = createOpenMmoRuntime({
        wasm,
        clientVersion: "idea2-m3-playable/0.1.0",
      });
      activeRuntime.current = nextRuntime;
      setRuntime(nextRuntime);
      nextRuntime.session.start();

      setPhase("connecting");
      nextRuntime.adapter.connect(nextServerUrl);
      await waitForConnected(nextRuntime);

      setPhase("authenticating");
      const auth = await nextRuntime.adapter.authenticateNpc(
        nextAccountName.trim(),
        nextNpcToken,
      );
      if (!auth.ok) {
        throw new Error(auth.message);
      }

      setPhase("lobby");
      return true;
    } catch (cause) {
      nextRuntime?.session.stop();
      nextRuntime?.adapter.disconnect();
      activeRuntime.current = null;
      setRuntime(null);
      setError(cause instanceof Error ? cause.message : String(cause));
      setPhase("error");
      return false;
    }
  }, [accountName, codecUrl, npcToken, serverUrl]);

  const startStandalone = async () => {
    if (!nativeTauri || phase === "starting_embedded") return;

    setError(null);
    setPhase("starting_embedded");

    try {
      const launch = await startOpenMmoEmbeddedHost();
      embeddedHostOwned.current = true;
      setEmbeddedLaunchConfig(launch);
      setServerUrl(launch.serverUrl);
      setAccountName(launch.accountName);
      setNpcToken(launch.npcToken);

      const started = await start(launch);
      if (!started) {
        await stopEmbeddedHost();
      }
    } catch (cause) {
      try {
        await stopEmbeddedHost();
      } catch {
        // Preserve the original startup error below.
      }
      setError(cause instanceof Error ? cause.message : String(cause));
      setPhase("error");
    }
  };

  useEffect(() => {
    return () => {
      activeRuntime.current?.session.stop();
      activeRuntime.current?.adapter.disconnect();
      activeRuntime.current = null;

      if (embeddedHostOwned.current) {
        embeddedHostOwned.current = false;
        void stopOpenMmoEmbeddedHost().catch(() => undefined);
      }
    };
  }, []);

  useEffect(() => {
    if (
      !nativeLaunchConfig?.autostart ||
      nativeAutostartConsumed.current
    ) {
      return;
    }

    nativeAutostartConsumed.current = true;
    setServerUrl(nativeLaunchConfig.serverUrl);
    setAccountName(nativeLaunchConfig.accountName);
    setNpcToken(nativeLaunchConfig.npcToken);
    void start(nativeLaunchConfig);
  }, [nativeLaunchConfig, start]);

  const reset = async () => {
    activeRuntime.current?.session.stop();
    activeRuntime.current?.adapter.disconnect();
    activeRuntime.current = null;
    setRuntime(null);

    try {
      await stopEmbeddedHost();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setPhase("error");
      return;
    }

    setServerUrl(defaultServerUrl);
    setAccountName(
      nativeLaunchConfig?.accountName ??
        params.get("account") ??
        "npc_idea2_player",
    );
    setNpcToken(nativeLaunchConfig?.npcToken ?? "");
    setError(null);
    setPhase("setup");
  };

  if (phase === "game" && runtime) {
    return <GameScreen session={runtime.session} />;
  }

  if (phase === "lobby" && runtime) {
    return (
      <main className="runtime-shell">
        <header className="runtime-header">
          <div>
            <p className="eyebrow">REAL OPENMMO RUNTIME</p>
            <h1>Character Lobby</h1>
          </div>
          <button
            type="button"
            className="text-button"
            onClick={() => void reset()}
          >
            연결 종료
          </button>
        </header>

        {embeddedLaunchConfig ? (
          <p className="runtime-panel__copy">
            STANDALONE · EMBEDDED AUTHORITATIVE CORE
          </p>
        ) : null}

        <OpenMmoCharacterLobby
          adapter={runtime.adapter}
          onEntered={() => setPhase("game")}
        />
      </main>
    );
  }

  const working =
    phase === "starting_embedded" ||
    phase === "loading_codec" ||
    phase === "connecting" ||
    phase === "authenticating";

  return (
    <main className="runtime-shell">
      <header className="runtime-header">
        <div>
          <p className="eyebrow">REAL OPENMMO</p>
          <h1>
            {androidTauri
              ? "Android OpenMMO Connection"
              : "Local Play Connection"}
          </h1>
        </div>
        {!nativeTauri ? (
          <a className="runtime-link" href={window.location.pathname}>
            LOCAL MODE
          </a>
        ) : null}
      </header>

      <section className="runtime-panel">
        {nativeTauri ? (
          <>
            <p className="runtime-panel__copy">
              Singleplayer는 이 기기 안에서 원본 OpenMMO 권위 서버 코어를 자동으로 시작하고 로컬로 연결한다. 서버 주소나 인증 token 입력은 필요하지 않으며 token은 브라우저 저장소나 URL에 저장하지 않는다.
            </p>
            <div className="runtime-actions">
              <button
                type="button"
                className="game-button game-button--primary"
                disabled={working}
                onClick={() => void startStandalone()}
              >
                {phase === "starting_embedded"
                  ? "STARTING LOCAL WORLD"
                  : "Singleplayer"}
              </button>
            </div>
            <p className="eyebrow">LAN / REMOTE</p>
          </>
        ) : null}

        <p className="runtime-panel__copy">
          {nativeTauri
            ? "외부 서버 플레이는 기존 Tauri Rust WebSocket transport를 그대로 사용한다. 같은 LAN의 서버 또는 원격 서버 주소를 입력할 수 있으며 인증 token은 브라우저 저장소나 URL에 저장하지 않는다."
            : "실제 pinned OpenMMO 서버에 연결한다. 인증 token은 브라우저 저장소나 URL에 저장하지 않는다."}
        </p>

        {nativeLaunchConfig ? (
          <p className="runtime-panel__copy">
            LOCAL OPENMMO 런처 감지됨 · {nativeLaunchConfig.serverUrl}
          </p>
        ) : null}

        <div className="runtime-fields">
          <label>
            <span>{nativeTauri ? "SERVER WEBSOCKET · LAN / REMOTE" : "SERVER WEBSOCKET"}</span>
            <input
              aria-label="OpenMMO server websocket"
              value={serverUrl}
              disabled={working}
              spellCheck={false}
              placeholder={androidTauri ? "ws://192.168.0.10:10006" : undefined}
              onChange={(event) => setServerUrl(event.target.value)}
            />
          </label>

          <label>
            <span>PINNED WASM MODULE</span>
            <input
              aria-label="OpenMMO codec"
              value={codecUrl}
              disabled={working}
              spellCheck={false}
              onChange={(event) => setCodecUrl(event.target.value)}
            />
          </label>

          <label>
            <span>PLAYER ACCOUNT</span>
            <input
              aria-label="OpenMMO account"
              value={accountName}
              disabled={working}
              spellCheck={false}
              onChange={(event) => setAccountName(event.target.value)}
            />
          </label>

          <label>
            <span>LOCAL AUTH TOKEN</span>
            <input
              aria-label="OpenMMO token"
              type="password"
              value={npcToken}
              disabled={working}
              autoComplete="off"
              onChange={(event) => setNpcToken(event.target.value)}
            />
          </label>
        </div>

        <div className="runtime-actions">
          <button
            aria-label="OpenMMO play"
            type="button"
            className="game-button game-button--primary"
            disabled={
              working ||
              !serverUrl.trim() ||
              !codecUrl.trim() ||
              !accountName.trim() ||
              !npcToken
            }
            onClick={() => void start()}
          >
            {phase === "loading_codec"
              ? "CODEC LOADING"
              : phase === "connecting"
                ? "CONNECTING"
                : phase === "authenticating"
                  ? "AUTHENTICATING"
                  : "OPENMMO 플레이"}
          </button>

          {phase === "error" ? (
            <button type="button" className="text-button" onClick={() => void reset()}>
              다시 연결
            </button>
          ) : null}
        </div>

        {error ? <p className="runtime-error">{error}</p> : null}
      </section>
    </main>
  );
}
