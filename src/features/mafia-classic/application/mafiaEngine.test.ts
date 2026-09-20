import { describe, expect, it } from "vitest";
import {
  beginDay,
  beginNight,
  createOriginalMafiaGame,
  mafiaCountForPlayerCount,
  nightProposalPasses,
  requiredMajority,
  resolveDayExecution,
  resolveMafiaNight,
  type MafiaGameState,
} from "./mafiaEngine";

function deterministicGame(): MafiaGameState {
  const rolls = [0, 0, 0, 0, 0, 0, 0, 0];
  let index = 0;
  return createOriginalMafiaGame(
    ["A", "B", "C", "D", "E", "F"],
    () => rolls[index++] ?? 0,
  );
}

describe("original Mafia rules", () => {
  it("uses Davidoff's original mafia counts", () => {
    expect(mafiaCountForPlayerCount(6)).toBe(2);
    expect(mafiaCountForPlayerCount(7)).toBe(2);
    expect(mafiaCountForPlayerCount(8)).toBe(3);
    expect(mafiaCountForPlayerCount(10)).toBe(3);
    expect(mafiaCountForPlayerCount(11)).toBe(4);
    expect(mafiaCountForPlayerCount(13)).toBe(4);
    expect(mafiaCountForPlayerCount(14)).toBe(5);
    expect(mafiaCountForPlayerCount(16)).toBe(5);
  });

  it("requires a strict majority", () => {
    expect(requiredMajority(5)).toBe(3);
    expect(requiredMajority(6)).toBe(4);
  });

  it("excludes the accused from a daytime guilty vote", () => {
    const game = beginDay(deterministicGame());
    const accused = game.players[0]!;

    const failed = resolveDayExecution(game, accused.id, 2);
    expect(failed.executed).toBe(false);
    expect(failed.threshold).toBe(3);

    const passed = resolveDayExecution(game, accused.id, 3);
    expect(passed.executed).toBe(true);
    expect(passed.state.players.find((player) => player.id === accused.id)?.alive).toBe(false);
  });

  it("requires a strict majority of all living players to start Mafia Night", () => {
    const game = beginDay(deterministicGame());
    expect(nightProposalPasses(game, 3)).toBe(false);
    expect(nightProposalPasses(game, 4)).toBe(true);
  });

  it("kills only when all surviving Mafia name the same target", () => {
    const game = beginNight(beginDay(deterministicGame()));
    const mafia = game.players.filter((player) => player.alignment === "mafia");
    const honest = game.players.filter((player) => player.alignment === "honest");

    const split = resolveMafiaNight(game, {
      [mafia[0]!.id]: honest[0]!.id,
      [mafia[1]!.id]: honest[1]!.id,
    });
    expect(split.unanimous).toBe(false);
    expect(split.murderedPlayerId).toBeNull();

    const unanimous = resolveMafiaNight(game, {
      [mafia[0]!.id]: honest[0]!.id,
      [mafia[1]!.id]: honest[0]!.id,
    });
    expect(unanimous.unanimous).toBe(true);
    expect(unanimous.murderedPlayerId).toBe(honest[0]!.id);
  });

  it("does not give Honest an immediate win when the last Mafia is executed", () => {
    let game = beginDay(deterministicGame());
    const mafiaIds = game.players
      .filter((player) => player.alignment === "mafia")
      .map((player) => player.id);

    game = resolveDayExecution(game, mafiaIds[0]!, 3).state;
    const living = game.players.filter((player) => player.alive).length;
    const threshold = requiredMajority(living - 1);
    game = resolveDayExecution(game, mafiaIds[1]!, threshold).state;

    expect(game.phase).toBe("day");
    expect(game.winner).toBeNull();

    const night = resolveMafiaNight(beginNight(game), {});
    expect(night.shotCount).toBe(0);
    expect(night.state.winner).toBe("honest");
  });
});
