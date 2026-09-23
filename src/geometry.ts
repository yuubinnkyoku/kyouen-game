/** Circumcircle of three grid points (cell centers at x+0.5, y+0.5 in 0..9 space). */
export interface Circle {
  cx: number;
  cy: number;
  r: number;
}

export function cellCenter(p: number, size = 9): { x: number; y: number } {
  const x = p % size;
  const y = Math.floor(p / size);
  return { x: x + 0.5, y: y + 0.5 };
}

export function circumcircle(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
): Circle | null {
  const { x: ax, y: ay } = a;
  const { x: bx, y: by } = b;
  const { x: cx, y: cy } = c;
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-9) return null;
  const a2 = ax * ax + ay * ay;
  const b2 = bx * bx + by * by;
  const c2 = cx * cx + cy * cy;
  const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
  const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
  const r = Math.hypot(ax - ux, ay - uy);
  return { cx: ux, cy: uy, r };
}

export function circleFromQuad(quad: number[]): Circle | null {
  if (quad.length < 3) return null;
  const [p0, p1, p2] = quad as [number, number, number];
  return circumcircle(cellCenter(p0), cellCenter(p1), cellCenter(p2));
}

export function coordName(p: number): string {
  const x = p % 9;
  const y = Math.floor(p / 9);
  const letters = "ABCDEFGHJ";
  return `${letters[x]}${y + 1}`;
}
