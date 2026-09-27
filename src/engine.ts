import { BoardBits, POINT_COUNT, hasPoint } from "./core";
import { buildCompletion, completionIndex } from "./rules";

export interface Engine {
  bannedFromState(state: BoardBits): bigint;
  legalMoves(state: BoardBits): number[];
  isLegal(state: BoardBits, p: number): boolean;
  /** For an unsafe empty point, one forbidden quadruple completed by playing p (if any). */
  blameQuad(state: BoardBits, p: number): number[] | null;
  /** Every forbidden quadruple already present on the board, with each 4-set returned once. */
  violatingQuads(state: BoardBits): number[][];
  forbiddenCount(): number;
}

function statePoints(state: BoardBits): number[] {
  const pts: number[] = [];
  for (let p = 0; p < POINT_COUNT; p++) if (hasPoint(state, p)) pts.push(p);
  return pts;
}

export function createEngineFromCompletion(table: bigint[]): Engine {
  const bannedFromState = (state: BoardBits): bigint => {
    const pts = statePoints(state);
    let banned = 0n;
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++)
        for (let k = j + 1; k < pts.length; k++)
          banned |= table[completionIndex(pts[i]!, pts[j]!, pts[k]!)]!;
    return banned;
  };

  const isLegal = (state: BoardBits, p: number): boolean => {
    if (hasPoint(state, p)) return false;
    const banned = bannedFromState(state);
    return ((banned >> BigInt(p)) & 1n) === 0n;
  };

  const legalMoves = (state: BoardBits): number[] => {
    const banned = bannedFromState(state);
    const out: number[] = [];
    for (let p = 0; p < POINT_COUNT; p++) {
      if (hasPoint(state, p)) continue;
      if (((banned >> BigInt(p)) & 1n) === 0n) out.push(p);
    }
    return out;
  };

  const blameQuad = (state: BoardBits, p: number): number[] | null => {
    if (hasPoint(state, p)) return null;
    const pts = statePoints(state);
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++)
        for (let k = j + 1; k < pts.length; k++) {
          const mask = table[completionIndex(pts[i]!, pts[j]!, pts[k]!)]!;
          if (((mask >> BigInt(p)) & 1n) === 1n) return [pts[i]!, pts[j]!, pts[k]!, p];
        }
    return null;
  };

  const violatingQuads = (state: BoardBits): number[][] => {
    const pts = statePoints(state);
    const out: number[][] = [];
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++)
        for (let k = j + 1; k < pts.length; k++) {
          const a = pts[i]!;
          const b = pts[j]!;
          const c = pts[k]!;
          const mask = table[completionIndex(a, b, c)]!;
          if (mask === 0n) continue;
          for (let l = k + 1; l < pts.length; l++) {
            const d = pts[l]!;
            if (((mask >> BigInt(d)) & 1n) === 1n) out.push([a, b, c, d]);
          }
        }
    return out;
  };

  return {
    bannedFromState,
    legalMoves,
    isLegal,
    blameQuad,
    violatingQuads,
    forbiddenCount: () => -1,
  };
}

export function createEngineFromForbidden(forbidden: number[][]): Engine {
  return createEngineFromCompletion(buildCompletion(forbidden));
}
