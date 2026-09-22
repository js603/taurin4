import type { GameCommand, GameState } from "./model";
import { createInitialGameState, reduceGame } from "./simulation";

export interface GameSession {
  getSnapshot: () => GameState;
  subscribe: (listener: () => void) => () => void;
  command: (command: GameCommand) => void;
  start: () => void;
  stop: () => void;
}

/**
 * UI-facing game port.
 *
 * idea2 starts with this deterministic local implementation. The OpenMMO
 * adapter will implement the same GameSession contract, so React does not
 * depend on Tauri IPC or the OpenMMO wire protocol.
 */
export class LocalGameSession implements GameSession {
  private state = createInitialGameState();
  private readonly listeners = new Set<() => void>();
  private timer: number | null = null;

  getSnapshot = () => this.state;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  command = (command: GameCommand) => {
    const next = reduceGame(this.state, command);
    if (next === this.state) return;
    this.state = next;
    this.listeners.forEach((listener) => listener());
  };

  start = () => {
    if (this.timer !== null) return;
    this.timer = window.setInterval(() => {
      this.command({ type: "TICK", elapsedMs: 100 });
    }, 100);
  };

  stop = () => {
    if (this.timer === null) return;
    window.clearInterval(this.timer);
    this.timer = null;
  };
}

export function createLocalGameSession(): GameSession {
  return new LocalGameSession();
}
