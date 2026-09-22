import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { canonicalize, shardOf, stateFromPoints } from "../../src/core";
import { lookupWitness, parseShardHeader, validateShardHeader } from "../../src/strategy";

const DIR = process.env.KYOuen_STRATEGY_DIR ?? ".strategy";

function shaFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

describe("strategy integration (real shards)", () => {
  it("manifest totals and checksums match", () => {
    const manifest = JSON.parse(readFileSync(`${DIR}/manifest.json`, "utf8")) as {
      totalRecords: number;
      totalBytes: number;
      shards: { id: string; filename: string; records: number; bytes: number; sha256: string }[];
      statistics: { minShardBytes: number; averageShardBytes: number; maxShardBytes: number };
    };
    expect(manifest.totalRecords).toBe(8826458);
    expect(manifest.shards).toHaveLength(256);
    let total = 0;
    for (const s of manifest.shards) {
      const p = `${DIR}/${s.filename}`;
      expect(existsSync(p)).toBe(true);
      const buf = readFileSync(p);
      expect(buf.length).toBe(s.bytes);
      expect(shaFile(p)).toBe(s.sha256);
      const h = parseShardHeader(new DataView(buf.buffer, buf.byteOffset, buf.byteLength));
      validateShardHeader(h, parseInt(s.id, 16), buf.length);
      total += buf.length;
    }
    expect(total).toBe(manifest.totalBytes);
    expect(manifest.statistics.minShardBytes).toBeGreaterThan(0);
  });

  it("root witness: center-only state resolves through canonical lookup (or is terminal-win)", () => {
    const manifest = JSON.parse(readFileSync(`${DIR}/manifest.json`, "utf8")) as {
      shards: { id: string; filename: string; records: number }[];
    };
    const state = stateFromPoints([40]);
    const { canon } = canonicalize(state);
    const shard = shardOf(canon.lo, canon.hi);
    const meta = manifest.shards[shard]!;
    const buf = readFileSync(`${DIR}/${meta.filename}`);
    const h = parseShardHeader(new DataView(buf.buffer, buf.byteOffset, buf.byteLength));
    const w = lookupWitness(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength), h.count, Number(canon.hi), canon.lo);
    expect(w).toBeGreaterThanOrEqual(-1);
    if (w >= 0) expect(w).toBeLessThan(81);
  });

  it("random playouts: cpu witnesses always legal, no strategy miss", async () => {
    const { createEngineFromForbidden } = await import("../../src/engine");
    const { generateForbidden } = await import("../../src/rules");
    const { StrategyStore, cpuMove } = await import("../../src/game");
    const engine = createEngineFromForbidden(generateForbidden());
    const store = new StrategyStore("http://127.0.0.1:8099");
    // serve real shards over file:// via fetch shim
    const origFetch = globalThis.fetch;
    (globalThis as unknown as { fetch: typeof fetch }).fetch = (async (url: unknown) => {
      const u = String(url);
      if (u.includes("manifest.json")) return new Response(readFileSync(`${DIR}/manifest.json`));
      const m = u.match(/([0-9a-f]{2})\.bin$/);
      if (m) {
        const buf = readFileSync(`${DIR}/${m[1]}.bin`);
        return new Response(buf as unknown as BodyInit);
      }
      return origFetch(url as never);
    }) as typeof fetch;
    await store.loadManifest("manifest.json");
    let seed = 12345;
    const rand = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed;
    };
    for (let game = 0; game < 3; game++) {
      let state = { lo: 0n, hi: 0n };
      const put = (p: number): void => {
        if (p < 64) state = { lo: state.lo | (1n << BigInt(p)), hi: state.hi };
        else state = { lo: state.lo, hi: state.hi | (1n << BigInt(p - 64)) };
      };
      put(40);
      for (let ply = 0; ply < 40; ply++) {
        const legal = engine.legalMoves(state);
        if (legal.length === 0) break;
        const pick = legal[rand() % legal.length]!;
        put(pick);
        const legal2 = engine.legalMoves(state);
        if (legal2.length === 0) break;
        const mv = await cpuMove(state, store, engine);
        expect(engine.isLegal(state, mv.point)).toBe(true);
        put(mv.point);
      }
    }
    (globalThis as unknown as { fetch: typeof fetch }).fetch = origFetch;
  }, 300000);
});
