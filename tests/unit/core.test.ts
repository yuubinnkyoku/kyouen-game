import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  BOARD_SIZE,
  CENTER_ID,
  POINT_COUNT,
  canonicalize,
  inverseTransform,
  inverseWitness,
  pointToXY,
  shardOf,
  stateFromPoints,
  transformPoint,
  transformState,
  withPoint,
  xyToPoint,
} from "../../src/core";
import { generateForbidden } from "../../src/rules";
import { createEngineFromForbidden } from "../../src/engine";
import {
  HEADER_BYTES,
  RECORD_BYTES,
  SHARD_FORMAT_VERSION,
  SHARD_MAGIC,
  decodeRecord,
  lookupWitness,
  parseShardHeader,
  validateShardHeader,
} from "../../src/strategy";

describe("point id mapping", () => {
  it("center is (4,4)/40 and mapping round-trips", () => {
    expect(BOARD_SIZE).toBe(9);
    expect(POINT_COUNT).toBe(81);
    expect(CENTER_ID).toBe(40);
    expect(pointToXY(40)).toEqual({ x: 4, y: 4 });
    for (let p = 0; p < 81; p++) {
      const { x, y } = pointToXY(p);
      expect(xyToPoint(x, y)).toBe(p);
    }
  });
});

describe("forbidden quadruples", () => {
  it("counts 29,152 dangerous quadruples", () => {
    const quads = generateForbidden();
    expect(quads).toHaveLength(29152);
  }, 300000);
});

describe("D4 transforms", () => {
  it("has 8 distinct images for an asymmetric state", () => {
    const s = stateFromPoints([0, 1, 40]);
    const seen = new Set<string>();
    for (let k = 0; k < 8; k++) {
      const t = transformState(s, k);
      seen.add(`${t.hi}:${t.lo}`);
    }
    expect(seen.size).toBe(8);
  });

  it("transform then inverse is identity for every point and kind", () => {
    for (let k = 0; k < 8; k++) {
      const inv = inverseTransform(k);
      for (let p = 0; p < 81; p++) {
        expect(transformPoint(inv, transformPoint(k, p))).toBe(p);
        expect(inverseWitness(k, transformPoint(k, p))).toBe(p);
      }
    }
  });

  it("canonicalize is idempotent and symmetry-invariant", () => {
    const states = [
      stateFromPoints([0, 40]),
      stateFromPoints([1, 2, 3, 40, 80]),
      stateFromPoints([10, 20, 30, 40, 50]),
    ];
    for (const s of states) {
      const { canon } = canonicalize(s);
      const again = canonicalize(canon);
      expect(again.canon).toEqual(canon);
      for (let k = 0; k < 8; k++) {
        expect(canonicalize(transformState(s, k)).canon).toEqual(canon);
      }
    }
  });

  it("witness round-trips through the chosen canonical transform", () => {
    const states = [stateFromPoints([40, 0]), stateFromPoints([40, 1, 9]), stateFromPoints([0, 8, 72])];
    for (const s of states) {
      const { canon, transform } = canonicalize(s);
      void canon;
      for (let w = 0; w < 81; w++) {
        const raw = inverseWitness(transform, w);
        expect(transformPoint(transform, raw)).toBe(w);
      }
    }
  });
});

describe("hash fixtures (native/python parity)", () => {
  it("matches tests/fixtures/hash-fixtures.json", () => {
    const fixtures = JSON.parse(readFileSync("tests/fixtures/hash-fixtures.json", "utf8")) as {
      name: string;
      lo: string;
      hi: number;
      shard: number;
    }[];
    expect(fixtures.length).toBeGreaterThan(0);
    for (const f of fixtures) {
      expect(shardOf(BigInt(f.lo), BigInt(f.hi))).toBe(f.shard);
    }
  });
});

describe("shard record encode/decode + binary search", () => {
  function makeShard(records: { lo: bigint; hi: number; witness: number }[]): Uint8Array {
    const sorted = [...records].sort((a, b) =>
      a.hi !== b.hi ? a.hi - b.hi : a.lo < b.lo ? -1 : a.lo > b.lo ? 1 : 0,
    );
    const bytes = new Uint8Array(HEADER_BYTES + sorted.length * RECORD_BYTES);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, SHARD_MAGIC, true);
    view.setUint16(4, SHARD_FORMAT_VERSION, true);
    view.setUint8(6, 0xab);
    view.setUint8(7, RECORD_BYTES);
    view.setBigUint64(8, BigInt(sorted.length), true);
    sorted.forEach((r, i) => {
      const off = HEADER_BYTES + i * RECORD_BYTES;
      let lo = r.lo;
      for (let b = 0; b < 8; b++) {
        bytes[off + b] = Number(lo & 0xffn);
        lo >>= 8n;
      }
      const meta = r.hi | (r.witness << 17);
      bytes[off + 8] = meta & 0xff;
      bytes[off + 9] = (meta >> 8) & 0xff;
      bytes[off + 10] = (meta >> 16) & 0xff;
    });
    return bytes;
  }

  it("decodes records and finds them via binary search", () => {
    const bytes = makeShard([
      { lo: 0n, hi: 0, witness: 40 },
      { lo: 5n, hi: 0, witness: 3 },
      { lo: 9n, hi: 1, witness: 80 },
    ]);
    const h = parseShardHeader(new DataView(bytes.buffer));
    h.shard = 0xab;
    validateShardHeader({ ...h, shard: 0xab }, 0xab, bytes.length);
    expect(decodeRecord(bytes, 0)).toEqual({ lo: 0n, hi: 0, witness: 40 });
    expect(lookupWitness(bytes, 3, 0, 0n)).toBe(40);
    expect(lookupWitness(bytes, 3, 0, 5n)).toBe(3);
    expect(lookupWitness(bytes, 3, 1, 9n)).toBe(80);
    expect(lookupWitness(bytes, 3, 0, 7n)).toBe(-1);
  });

  it("rejects malformed headers", () => {
    const bytes = makeShard([{ lo: 1n, hi: 0, witness: 0 }]);
    const bad = bytes.slice();
    bad[0] = 0x00;
    expect(() =>
      validateShardHeader(parseShardHeader(new DataView(bad.buffer)), 0xab, bad.length),
    ).toThrow();
    expect(() => validateShardHeader(parseShardHeader(new DataView(bytes.buffer)), 0x00, bytes.length)).toThrow();
    expect(() =>
      validateShardHeader(parseShardHeader(new DataView(bytes.buffer)), 0xab, bytes.length - 1),
    ).toThrow();
  });
});

describe("rules engine", () => {
  const engine = createEngineFromForbidden(generateForbidden());

  it("center opening leaves 80 legal replies", () => {
    const s = withPoint({ lo: 0n, hi: 0n }, 40);
    expect(engine.legalMoves(s)).toHaveLength(80);
  });

  it("detects an illegal completing move (row of 4 needs the 5th point collinear)", () => {
    const s = stateFromPoints([0, 1, 2]);
    expect(engine.isLegal(s, 3)).toBe(false);
    expect(engine.blameQuad(s, 3)).toEqual([0, 1, 2, 3]);
    expect(engine.isLegal(s, 40)).toBe(true);
  });

  it("occupied points are illegal", () => {
    const s = stateFromPoints([40]);
    expect(engine.isLegal(s, 40)).toBe(false);
  });
});
