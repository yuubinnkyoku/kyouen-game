export const BOARD_SIZE = 9;
export const POINT_COUNT = 81;
export const CENTER_ID = 40;
export const STRATEGY_VERSION = "strategy-v1";
export const MANIFEST_PATH = "strategy/manifest.json";

export const MIX_MULT_1 = 0xbf58476d1ce4e5b9n;
export const MIX_MULT_2 = 0x94d049bb133111ebn;
export const HI_MULT = 0x9e3779b97f4a7c15n;
export const MASK64 = (1n << 64n) - 1n;

export interface BoardBits {
  lo: bigint;
  hi: bigint;
}

export function pointToXY(id: number): { x: number; y: number } {
  return { x: id % BOARD_SIZE, y: Math.floor(id / BOARD_SIZE) };
}

export function xyToPoint(x: number, y: number): number {
  return y * BOARD_SIZE + x;
}

/** D4 transform of a point id. kind 0..7 matches the C++ checker ordering. */
export function transformPoint(kind: number, id: number): number {
  const n = BOARD_SIZE;
  const x = id % n;
  const y = Math.floor(id / n);
  let nx = x;
  let ny = y;
  switch (kind) {
    case 0: nx = x; ny = y; break;
    case 1: nx = n - 1 - x; ny = y; break;
    case 2: nx = x; ny = n - 1 - y; break;
    case 3: nx = n - 1 - x; ny = n - 1 - y; break;
    case 4: nx = y; ny = x; break;
    case 5: nx = n - 1 - y; ny = x; break;
    case 6: nx = y; ny = n - 1 - x; break;
    default: nx = n - 1 - y; ny = n - 1 - x; break;
  }
  return ny * n + nx;
}

export function inverseTransform(kind: number): number {
  return [0, 1, 2, 3, 4, 6, 5, 7][kind]!;
}

const TRANSFORM_TABLE: number[][] = (() => {
  const t: number[][] = [];
  for (let k = 0; k < 8; k++) {
    const row: number[] = [];
    for (let p = 0; p < POINT_COUNT; p++) row.push(transformPoint(k, p));
    t.push(row);
  }
  return t;
})();

export function transformState(state: BoardBits, kind: number): BoardBits {
  let lo = 0n;
  let hi = 0n;
  const row = TRANSFORM_TABLE[kind]!;
  for (let p = 0; p < POINT_COUNT; p++) {
    const has = p < 64 ? (state.lo >> BigInt(p)) & 1n : (state.hi >> BigInt(p - 64)) & 1n;
    if (has) {
      const q = row[p]!;
      if (q < 64) lo |= 1n << BigInt(q);
      else hi |= 1n << BigInt(q - 64);
    }
  }
  return { lo, hi };
}

function cmpState(a: BoardBits, b: BoardBits): number {
  if (a.hi !== b.hi) return a.hi < b.hi ? -1 : 1;
  if (a.lo !== b.lo) return a.lo < b.lo ? -1 : 1;
  return 0;
}

/** Minimal (hi,lo) lexicographic state among the 8 D4 images, plus the chosen transform id. */
export function canonicalize(state: BoardBits): { canon: BoardBits; transform: number } {
  let best = state;
  let kind = 0;
  for (let k = 1; k < 8; k++) {
    const t = transformState(state, k);
    if (cmpState(t, best) < 0) {
      best = t;
      kind = k;
    }
  }
  return { canon: best, transform: kind };
}

/** Inverse of canonicalize's forward transform for witness ids. */
export function inverseWitness(transform: number, canonWitness: number): number {
  const inv = inverseTransform(transform);
  return TRANSFORM_TABLE[inv]![canonWitness]!;
}

export function mix64(x: bigint): bigint {
  let v = x & MASK64;
  v = (v ^ (v >> 30n)) & MASK64;
  v = (v * MIX_MULT_1) & MASK64;
  v = (v ^ (v >> 27n)) & MASK64;
  v = (v * MIX_MULT_2) & MASK64;
  v = (v ^ (v >> 31n)) & MASK64;
  return v;
}

export function stateKey(lo: bigint, hi: bigint): bigint {
  return ((lo ^ ((hi * HI_MULT) & MASK64)) & MASK64);
}

export function shardOf(lo: bigint, hi: bigint): number {
  return Number(mix64(stateKey(lo, hi)) & 0xffn);
}

export function stateFromPoints(points: number[]): BoardBits {
  let lo = 0n;
  let hi = 0n;
  for (const p of points) {
    if (p < 64) lo |= 1n << BigInt(p);
    else hi |= 1n << BigInt(p - 64);
  }
  return { lo, hi };
}

export function hasPoint(state: BoardBits, p: number): boolean {
  return p < 64 ? ((state.lo >> BigInt(p)) & 1n) === 1n : ((state.hi >> BigInt(p - 64)) & 1n) === 1n;
}

export function withPoint(state: BoardBits, p: number): BoardBits {
  if (p < 64) return { lo: state.lo | (1n << BigInt(p)), hi: state.hi };
  return { lo: state.lo, hi: state.hi | (1n << BigInt(p - 64)) };
}
