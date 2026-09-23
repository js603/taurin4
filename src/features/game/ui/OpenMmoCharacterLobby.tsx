import { useState, useSyncExternalStore } from "react";
import type { OpenMmoAdapter } from "../../../openmmo/adapter";
import type {
  OpenMmoCharacter,
  OpenMmoCharacterAttributes,
  OpenMmoCharacterClass,
  OpenMmoGender,
} from "../../../openmmo/types";

const CLASSES: readonly OpenMmoCharacterClass[] = [
  "knight",
  "barbarian",
  "rogue",
  "caveman",
  "valkyrie",
  "ranger",
  "priest",
  "bard",
  "merchant",
  "guard",
  "maid",
];

function attributeLine(attributes: OpenMmoCharacterAttributes) {
  return [
    "STR " + attributes.str,
    "DEX " + attributes.dex,
    "CON " + attributes.con,
    "INT " + attributes.int,
    "WIS " + attributes.wis,
    "CHA " + attributes.cha,
    "GRD " + attributes.guard,
  ].join(" · ");
}

function CharacterCard({
  character,
  busy,
  onEnter,
  onDelete,
}: {
  character: OpenMmoCharacter;
  busy: boolean;
  onEnter: (character: OpenMmoCharacter) => void;
  onDelete: (character: OpenMmoCharacter) => void;
}) {
  return (
    <article className="character-card">
      <div>
        <p className="eyebrow">
          LV {character.level} · {character.class.toUpperCase()}
        </p>
        <h3>{character.name}</h3>
        <p className="character-card__stats">
          {attributeLine(character.attributes)}
        </p>
      </div>
      <div className="character-card__actions">
        <button
          type="button"
          className="game-button game-button--primary"
          disabled={busy}
          onClick={() => onEnter(character)}
        >
          입장
        </button>
        <button
          type="button"
          className="text-button"
          disabled={busy}
          onClick={() => onDelete(character)}
        >
          삭제
        </button>
      </div>
    </article>
  );
}

export function OpenMmoCharacterLobby({
  adapter,
  onEntered,
}: {
  adapter: OpenMmoAdapter;
  onEntered?: (character: OpenMmoCharacter) => void;
}) {
  const snapshot = useSyncExternalStore(
    adapter.subscribe,
    adapter.getSnapshot,
    adapter.getSnapshot,
  );
  const [name, setName] = useState("");
  const [characterClass, setCharacterClass] =
    useState<OpenMmoCharacterClass>("knight");
  const [gender, setGender] = useState<OpenMmoGender>("male");
  const [rolled, setRolled] = useState<{
    attributes: OpenMmoCharacterAttributes;
    maxHp: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const roll = async () => {
    setBusy(true);
    setNotice(null);
    const result = await adapter.rollCharacterStats(characterClass, gender);
    if (result.ok) {
      setRolled({
        attributes: result.attributes,
        maxHp: result.maxHp,
      });
    } else {
      setNotice(result.message);
    }
    setBusy(false);
  };

  const create = async () => {
    if (!name.trim() || !rolled) return;
    setBusy(true);
    setNotice(null);
    const result = await adapter.createCharacter(
      name.trim(),
      characterClass,
      gender,
    );
    if (result.ok) {
      setName("");
      setRolled(null);
      setNotice(result.character.name + " 생성 완료");
    } else {
      setNotice(result.message);
    }
    setBusy(false);
  };

  const enter = async (character: OpenMmoCharacter) => {
    setBusy(true);
    setNotice(null);
    const result = await adapter.enterGame(character.id);
    if (result.ok) {
      onEntered?.(character);
    } else {
      setNotice(result.message);
    }
    setBusy(false);
  };

  const remove = async (character: OpenMmoCharacter) => {
    setBusy(true);
    setNotice(null);
    const result = await adapter.deleteCharacter(character.id);
    setNotice(
      result.ok ? character.name + " 삭제 완료" : result.message,
    );
    setBusy(false);
  };

  return (
    <section className="character-lobby" aria-label="OpenMMO character lobby">
      <header className="character-lobby__header">
        <div>
          <p className="eyebrow">OPENMMO CHARACTER</p>
          <h2>{snapshot.accountName ?? "CHARACTER SELECT"}</h2>
        </div>
        <span>{snapshot.characters.length} / 3</span>
      </header>

      <div className="character-lobby__list">
        {snapshot.characters.map((character) => (
          <CharacterCard
            key={character.id}
            character={character}
            busy={busy}
            onEnter={enter}
            onDelete={remove}
          />
        ))}
      </div>

      {snapshot.characters.length < 3 ? (
        <section className="character-create">
          <div className="character-create__heading">
            <p className="eyebrow">NEW CHARACTER</p>
            <strong>새 캐릭터</strong>
          </div>

          <div className="character-create__fields">
            <label>
              <span>NAME</span>
              <input
                value={name}
                disabled={busy}
                maxLength={24}
                onChange={(event) => setName(event.target.value)}
              />
            </label>

            <label>
              <span>CLASS</span>
              <select
                value={characterClass}
                disabled={busy}
                onChange={(event) => {
                  setCharacterClass(
                    event.target.value as OpenMmoCharacterClass,
                  );
                  setRolled(null);
                }}
              >
                {CLASSES.map((value) => (
                  <option key={value} value={value}>
                    {value.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>GENDER</span>
              <select
                value={gender}
                disabled={busy}
                onChange={(event) => {
                  setGender(event.target.value as OpenMmoGender);
                  setRolled(null);
                }}
              >
                <option value="male">MALE</option>
                <option value="female">FEMALE</option>
              </select>
            </label>
          </div>

          {rolled ? (
            <div className="character-roll">
              <strong>MAX HP {rolled.maxHp}</strong>
              <span>{attributeLine(rolled.attributes)}</span>
            </div>
          ) : null}

          <div className="character-create__actions">
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={roll}
            >
              스탯 굴리기
            </button>
            <button
              type="button"
              className="game-button game-button--primary"
              disabled={busy || !rolled || !name.trim()}
              onClick={create}
            >
              생성
            </button>
          </div>
        </section>
      ) : null}

      {notice ?? snapshot.lastError ? (
        <p className="character-lobby__notice">
          {notice ?? snapshot.lastError}
        </p>
      ) : null}
    </section>
  );
}
