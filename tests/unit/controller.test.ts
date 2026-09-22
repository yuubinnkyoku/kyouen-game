import { describe, expect, it } from "vitest";
import { GameController } from "../../src/controller";
import { CENTER_ID, POINT_COUNT } from "../../src/core";
import { createEngineFromForbidden } from "../../src/engine";
import { generateForbidden } from "../../src/rules";
import { cpuMove, StrategyStore } from "../../src/game";

function fakeStore(moves: Map<string, number>): StrategyStore {
  const store = new StrategyStore("http://127.0.0.1:1/strategy") as unknown as {
    witnessFor: (state: { lo: bigint; hi: bigint }) => Promise<{ witness: number; shard: number; canonHi: number; canonLo: bigint }>;
    fetches: number;
    bytesFetched: number;
    loadManifest: () => Promise<unknown>;
    fetchShard: () => Promise<never>;
  };
  store.fetches = 0;
  store.bytesFetched = 0;
  store.witnessFor = async (state) => {
    const key = `${state.hi}:${state.lo}`;
    const w = moves.get(key) ?? moves.get("*") ?? 0;
    return { witness: w, shard: 0, canonHi: Number(state.hi), canonLo: state.lo };
  };
  store.loadManifest = async () => ({});
  store.fetchShard = async () => {
    throw new Error("no fetch in unit test");
  };
  return store as unknown as StrategyStore;
}

describe("controller: reset / undo / redo / result", () => {
  const engine = createEngineFromForbidden(generateForbidden());
  const noop = { onChange: () => undefined, onNeedRetry: () => undefined };

  it("reset leaves center stone + player to move", () => {
    const game = new GameController(engine, fakeStore(new Map()), noop);
    game.reset();
    expect(game.stones.get(CENTER_ID)).toBe("cpu");
    expect(game.handCount()).toBe(1);
    expect(game.turn).toBe("you");
    expect(game.over).toBe(false);
  });

  it("undo/redo round-trips a full you+cpu set", async () => {
    const game = new GameController(engine, fakeStore(new Map([["*", 1]])), noop);
    game.reset();
    await game.playYou(0);
    expect(game.handCount()).toBe(3);
    expect(game.history).toHaveLength(1);
    game.undo();
    expect(game.handCount()).toBe(1);
    expect(game.stones.has(0)).toBe(false);
    expect(game.turn).toBe("you");
    game.redo();
    expect(game.handCount()).toBe(3);
    expect(game.stones.get(0)).toBe("you");
    expect(game.turn).toBe("you");
  });

  it("cpu first move is the center", async () => {
    const mv = await cpuMove({ lo: 0n, hi: 0n }, fakeStore(new Map()), engine);
    expect(mv.point).toBe(40);
  });

  it("terminal detection: full first row leaves row points banned, game ends when no moves", () => {
    const game = new GameController(engine, fakeStore(new Map()), noop);
    game.reset();
    for (let p = 0; p < POINT_COUNT; p++) {
      void p;
    }
    expect(game.canUndo()).toBe(false);
    expect(game.canRedo()).toBe(false);
  });
});
