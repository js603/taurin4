export type OpenMmoCharacterClass =
  | "knight"
  | "barbarian"
  | "rogue"
  | "caveman"
  | "valkyrie"
  | "ranger"
  | "priest"
  | "bard"
  | "merchant"
  | "guard"
  | "maid";

export type OpenMmoGender = "male" | "female";

export interface OpenMmoCharacterAttributes {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
  guard: number;
}

export interface OpenMmoCharacter {
  id: number;
  name: string;
  level: number;
  xp: number;
  max_hp: number;
  attributes: OpenMmoCharacterAttributes;
  class: OpenMmoCharacterClass;
  gender: OpenMmoGender;
}

export type OpenMmoClientMessage =
  | {
      ClientInfo: {
        protocol_version: number;
        client_kind: string;
        client_version: string;
      };
    }
  | { Authenticate: { google_id_token: string } }
  | { AuthenticateNpc: { account_name: string; npc_token: string } }
  | {
      RollCharacterStats: {
        character_class: OpenMmoCharacterClass;
        gender: OpenMmoGender;
      };
    }
  | {
      CreateCharacter: {
        character_name: string;
        character_class: OpenMmoCharacterClass;
        gender: OpenMmoGender;
      };
    }
  | { DeleteCharacter: { character_id: number } }
  | { RenameCharacter: { character_id: number; new_name: string } }
  | { EnterGame: { character_id: number } }
  | "WorldReady"
  | "Heartbeat"
  | "RequestRespawn"
  | { ChatMessage: { message: string } }
  | { PlayerAttack: { monster_id: string } };

export type OpenMmoServerMessage =
  | {
      AuthSuccess: {
        account_name: string;
        characters: OpenMmoCharacter[];
      };
    }
  | { AuthError: { message: string } }
  | {
      CharacterStatsRolled: {
        attributes: OpenMmoCharacterAttributes;
        max_hp: number;
      };
    }
  | { CharacterCreated: { character: OpenMmoCharacter } }
  | { CharacterDeleted: { character_id: number } }
  | { CharacterRenamed: { character_id: number; name: string } }
  | { CharacterRenameRequired: { character_id: number } }
  | { CharacterError: { message: string } }
  | { JoinSuccess: Record<string, unknown> }
  | { GameTimeSync: Record<string, unknown> }
  | { PlayerRespawned: Record<string, unknown> }
  | Record<string, unknown>;

export type OpenMmoConnectionPhase =
  | "idle"
  | "connecting"
  | "handshaking"
  | "connected"
  | "authenticated"
  | "entering"
  | "in_game"
  | "closed"
  | "error";

export interface OpenMmoAdapterSnapshot {
  phase: OpenMmoConnectionPhase;
  endpoint: string | null;
  accountName: string | null;
  characters: readonly OpenMmoCharacter[];
  selectedCharacterId: number | null;
  lastError: string | null;
}
