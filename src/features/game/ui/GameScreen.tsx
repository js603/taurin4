import {
  useEffect,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from "react";
import { getAttentionCard } from "../../../game/attention";
import {
  DESTINATION_IDS,
  LOCATIONS,
  type GameCommand,
  type Location,
} from "../../../game/model";
import {
  createLocalGameSession,
  type GameSession,
} from "../../../game/session";
import { HostControl } from "./HostControl";
import { LanClientControl } from "./LanClientControl";

function formatTime(worldMinutes: number) {
  const hour = Math.floor(worldMinutes / 60) % 24;
  const minute = worldMinutes % 60;
  return String(hour).padStart(2, "0") + ":" + String(minute).padStart(2, "0");
}

function dangerText(danger: number) {
  return "●".repeat(danger) + "○".repeat(Math.max(0, 5 - danger));
}

function DestinationCard({
  location,
  onTravel,
}: {
  location: Location;
  onTravel: (location: Location) => void;
}) {
  return (
    <button
      className="destination-card"
      type="button"
      onClick={() => onTravel(location)}
    >
      <span className="destination-card__top">
        <strong>{location.name}</strong>
        <span className="danger">{dangerText(location.danger)}</span>
      </span>
      <span className="destination-card__description">
        {location.description}
      </span>
      <span className="destination-card__tags">
        {location.tags.join(" · ")}
      </span>
      <span className="destination-card__action">이동</span>
    </button>
  );
}

function abilityLabel(id: string) {
  return id
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function semanticKindLabel(kind: "monster" | "player" | "npc" | "loot") {
  if (kind === "monster") return "MONSTER";
  if (kind === "player") return "PLAYER";
  if (kind === "npc") return "NPC";
  return "LOOT";
}

function FloatingAttention({
  session,
}: {
  session: GameSession;
}) {
  const state = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  const card = getAttentionCard(state);

  if (!card) return null;

  return (
    <div className={"attention-layer attention-layer--" + card.level}>
      <section
        className={"attention-card attention-card--" + card.level}
        role="dialog"
        aria-modal={card.level !== "floating"}
        aria-live={card.level === "critical" ? "assertive" : "polite"}
      >
        <p className="attention-card__eyebrow">{card.eyebrow}</p>
        <h2>{card.title}</h2>
        {card.countdownMs !== undefined ? (
          <div className="countdown">
            {(card.countdownMs / 1000).toFixed(1)}
            <small>SEC</small>
          </div>
        ) : null}
        <p className="attention-card__body">{card.body}</p>
        <div className="attention-card__actions">
          {card.choices.map((choice, index) => (
            <button
              key={choice.label}
              aria-label={"Attention action " + choice.label}
              type="button"
              className={
                "game-button " +
                (choice.emphasis === "primary"
                  ? "game-button--primary"
                  : choice.emphasis === "danger"
                    ? "game-button--danger"
                    : "")
              }
              onClick={() => session.command(choice.command)}
            >
              <span className="keycap">{index + 1}</span>
              {choice.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

export function GameScreen({
  session: providedSession,
}: {
  session?: GameSession;
} = {}) {
  const [localSession] = useState<GameSession>(() => createLocalGameSession());
  const session = providedSession ?? localSession;
  const state = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  const card = getAttentionCard(state);
  const currentLocation = LOCATIONS[state.currentLocationId];
  const openMmo = state.source === "openmmo";
  const openMmoStateLabel = openMmo
    ? [
        "OpenMMO player state",
        "HP " + state.player.hp + "/" + state.player.maxHp,
        "MP " + state.player.mp + "/" + state.player.maxMp,
        "FLOOR " + state.player.floorLevel,
        "X " + (state.player.position?.x.toFixed(2) ?? "NA"),
        "Z " + (state.player.position?.z.toFixed(2) ?? "NA"),
      ].join(" · ")
    : undefined;

  useEffect(() => {
    session.start();
    return () => session.stop();
  }, [session]);

  const send = (command: GameCommand) => session.command(command);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.target instanceof HTMLButtonElement) return;

    if (event.key === "Escape") {
      send({ type: "CLOSE_NEARBY" });
      return;
    }

    if (!card) return;
    const index = Number(event.key) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= card.choices.length) {
      return;
    }
    send(card.choices[index].command);
  };

  const travelPercent = state.travel
    ? Math.round(state.travel.progress * 100)
    : 0;

  return (
    <main
      className="game-shell"
      aria-label={openMmo ? "OpenMMO game screen" : "Local game screen"}
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <section
        className={
          "world-stage " +
          (card && card.level !== "floating" ? "world-stage--defocused" : "")
        }
      >
        <header className="world-header">
          <div>
            <p className="eyebrow">
              {openMmo ? "OPENMMO · AUTHORITATIVE WORLD" : currentLocation.subtitle}
            </p>
            <h1>{openMmo ? "OpenMMO World" : currentLocation.name}</h1>
          </div>
          <div className="world-clock">{formatTime(state.worldMinutes)}</div>
        </header>

        <div className="world-copy">
          <p className="world-kicker">
            {state.phase === "travel"
              ? "TRAVELLING"
              : state.phase === "combat"
                ? "DANGER"
                : "WORLD"}
          </p>
          <p className="world-description">
            {state.phase === "travel" && state.travel
              ? LOCATIONS[state.travel.destinationId].name +
                "로 향하고 있다. 평범한 이동은 압축되고 중요한 사건만 확대된다."
              : state.phase === "combat" && state.combat
                ? state.combat.enemy.name +
                  "이(가) " +
                  state.combat.enemy.distanceMeters +
                  "m 앞에서 공격 기회를 노리고 있다."
                : openMmo
                  ? state.semanticTravel
                    ? state.semanticTravel.label +
                      " 쪽으로 이동 중이다. 좌표 대신 의미 있는 대상만 표시한다."
                    : "원본 OpenMMO 서버의 권위 상태를 Text/Card 이벤트로 표현하고 있다."
                  : currentLocation.description}
          </p>

          {state.travel ? (
            <div className="travel-progress" aria-label="이동 진행도">
              <div className="travel-progress__meta">
                <span>{LOCATIONS[state.travel.destinationId].name}</span>
                <span>{travelPercent}%</span>
              </div>
              <div className="travel-progress__track">
                <div
                  className="travel-progress__bar"
                  style={{ width: travelPercent + "%" }}
                />
              </div>
            </div>
          ) : null}
        </div>

        {openMmo && (state.semanticDestinations?.length ?? 0) > 0 ? (
          <div
            className="semantic-destination-stack"
            aria-label="OpenMMO 주변 대상"
          >
            {state.semanticDestinations?.slice(0, 6).map((destination) => (
              <button
                key={destination.id}
                className="semantic-destination-card"
                type="button"
                onClick={() => {
                  if (
                    destination.kind === "loot" &&
                    destination.distanceMeters <= 1.2
                  ) {
                    const instanceId = Number(
                      destination.id.slice("loot:".length),
                    );
                    if (Number.isFinite(instanceId)) {
                      send({ type: "PICKUP_ITEM", instanceId });
                      return;
                    }
                  }
                  send({
                    type: "TRAVEL_TO_DESTINATION",
                    destinationId: destination.id,
                  });
                }}
              >
                <span className="semantic-destination-card__meta">
                  <span>{semanticKindLabel(destination.kind)}</span>
                  <span>{destination.distanceMeters.toFixed(1)}m</span>
                </span>
                <strong>{destination.label}</strong>
                <span className="semantic-destination-card__detail">
                  {state.semanticTravel?.destinationId === destination.id
                    ? "이동 중"
                    : destination.kind === "loot" &&
                        destination.distanceMeters <= 1.2
                      ? "줍기"
                      : destination.detail ?? "접근 가능"}
                </span>
              </button>
            ))}
          </div>
        ) : null}

        {!openMmo && state.nearbyOpen ? (
          <div className="destination-stack" aria-label="이동 가능한 장소">
            {DESTINATION_IDS.map((id) => (
              <DestinationCard
                key={id}
                location={LOCATIONS[id]}
                onTravel={(location) =>
                  send({
                    type: "START_TRAVEL",
                    destinationId: location.id,
                  })
                }
              />
            ))}
          </div>
        ) : null}

        <footer className="status-bar">
          <span aria-label={openMmoStateLabel}>
            HP {state.player.hp}/{state.player.maxHp} · MP {state.player.mp}/
            {state.player.maxMp}
          </span>
          <div className="status-bar__actions">
            {openMmo ? (
              <span>SERVER AUTHORITATIVE</span>
            ) : (
              <button
                className="text-button"
                type="button"
                disabled={state.phase !== "exploration"}
                onClick={() =>
                  send({
                    type: state.nearbyOpen ? "CLOSE_NEARBY" : "OPEN_NEARBY",
                  })
                }
              >
                {state.nearbyOpen ? "카드 닫기" : "주변 보기"}
              </button>
            )}
          </div>
        </footer>

        <FloatingAttention session={session} />
      </section>

      {openMmo ? (
        <section className="openmmo-action-panels" aria-label="OpenMMO actions">
          <div className="openmmo-panel">
            <div className="openmmo-panel__heading">
              <span>ABILITIES</span>
              <span>SERVER VALIDATED</span>
            </div>
            <div className="openmmo-ability-grid">
              {(state.abilities ?? []).map((ability) => (
                <button
                  key={ability.id}
                  type="button"
                  className="text-button openmmo-ability"
                  disabled={ability.remainingMs > 0}
                  onClick={() =>
                    send({
                      type: "USE_ABILITY",
                      ability: ability.id,
                    })
                  }
                >
                  <strong>{abilityLabel(ability.id)}</strong>
                  <span>
                    {ability.remainingMs > 0
                      ? (ability.remainingMs / 1000).toFixed(1) + "s"
                      : "READY"}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="openmmo-panel">
            <div className="openmmo-panel__heading">
              <span>INVENTORY</span>
              <span>
                {(state.inventory?.bag.length ?? 0) +
                  (state.inventory?.equipped.length ?? 0)}{" "}
                ITEMS
              </span>
            </div>

            <div className="openmmo-inventory-list">
              {(state.inventory?.equipped ?? []).map((item) => (
                <button
                  key={"equipped-" + item.instanceId}
                  type="button"
                  className="inventory-line inventory-line--equipped"
                  onClick={() =>
                    item.equippedSlot
                      ? send({
                          type: "UNEQUIP_ITEM",
                          slot: item.equippedSlot,
                        })
                      : undefined
                  }
                >
                  <span>
                    {item.itemDefId.replaceAll("_", " ")}
                    {item.enchant ? " +" + item.enchant : ""}
                  </span>
                  <small>{item.equippedSlot ?? "EQUIPPED"}</small>
                </button>
              ))}

              {(state.inventory?.bag ?? []).slice(0, 10).map((item) => (
                <button
                  key={"bag-" + item.instanceId}
                  type="button"
                  className="inventory-line"
                  disabled={item.locked}
                  onClick={() =>
                    send({
                      type: "EQUIP_ITEM",
                      instanceId: item.instanceId,
                    })
                  }
                >
                  <span>
                    {item.itemDefId.replaceAll("_", " ")}
                    {item.quantity > 1 ? " × " + item.quantity : ""}
                    {item.enchant ? " +" + item.enchant : ""}
                  </span>
                  <small>{item.locked ? "LOCKED" : "장착 시도"}</small>
                </button>
              ))}

              {(state.inventory?.bag.length ?? 0) === 0 &&
              (state.inventory?.equipped.length ?? 0) === 0 ? (
                <p className="openmmo-panel__empty">
                  서버 인벤토리 상태를 기다리고 있다.
                </p>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      <section className="event-log" aria-label="이벤트 로그">
        <div className="event-log__heading">
          <span>EVENT LOG</span>
          <span>{state.phase.toUpperCase()}</span>
        </div>
        <div className="event-log__entries" aria-live="polite">
          {state.logs.map((entry) => (
            <div
              key={entry.id}
              className={"event-log__entry event-log__entry--" + entry.attention}
            >
              <time>{formatTime(entry.worldMinutes)}</time>
              <span>{entry.text}</span>
            </div>
          ))}
        </div>
      </section>

      {!openMmo ? (
        <section className="network-controls" aria-label="LAN network controls">
          <HostControl />
          <LanClientControl />
        </section>
      ) : null}
    </main>
  );
}