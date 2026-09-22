import { POINT_COUNT, pointToXY } from "./core";

function det3(
  a00: number, a01: number, a02: number,
  a10: number, a11: number, a12: number,
  a20: number, a21: number, a22: number,
): number {
  return (
    a00 * (a11 * a22 - a12 * a21) -
    a01 * (a10 * a22 - a12 * a20) +
    a02 * (a10 * a21 - a11 * a20)
  );
}

function forbiddenQuad(a: number, b: number, c: number, d: number): boolean {
  const ids = [a, b, c, d];
  const m: number[][] = [];
  for (let r = 0; r < 4; r++) {
    const { x, y } = pointToXY(ids[r]!);
    m.push([x * x + y * y, x, y, 1]);
  }
  let det = 0;
  for (let col = 0; col < 4; col++) {
    const z: number[][] = [];
    for (let r = 1; r < 4; r++) {
      const row: number[] = [];
      for (let c2 = 0; c2 < 4; c2++) if (c2 !== col) row.push(m[r]![c2]!);
      z.push(row);
    }
    const md = det3(
      z[0]![0]!, z[0]![1]!, z[0]![2]!,
      z[1]![0]!, z[1]![1]!, z[1]![2]!,
      z[2]![0]!, z[2]![1]!, z[2]![2]!,
    );
    det += (col % 2 === 0 ? 1 : -1) * m[0]![col]! * md;
  }
  return det === 0;
}

export function generateForbidden(): number[][] {
  const out: number[][] = [];
  const n = POINT_COUNT;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++)
          if (forbiddenQuad(a, b, c, d)) out.push([a, b, c, d]);
  return out;
}

/**
 * completion[(a*V+b)*V+c] for sorted a<b<c -> bitmask (BigInt, 81 bits) of every d
 * completing a forbidden quadruple. Mirrors tools/gen-forbidden.mjs output.
 */
export function buildCompletion(forbidden: number[][]): bigint[] {
  const V = POINT_COUNT;
  const table = new Array<bigint>(V * V * V).fill(0n);
  for (const [a0, b0, c0, d0] of forbidden) {
    const q = [a0!, b0!, c0!, d0!];
    for (let omit = 0; omit < 4; omit++) {
      const t: number[] = [];
      for (let j = 0; j < 4; j++) if (j !== omit) t.push(q[j]!);
      const [a, b, c] = t as [number, number, number];
      table[(a * V + b) * V + c]! |= 1n << BigInt(q[omit]!);
    }
  }
  return table;
}

export function completionIndex(a: number, b: number, c: number): number {
  return (a * POINT_COUNT + b) * POINT_COUNT + c;
}
