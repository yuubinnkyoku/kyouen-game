// Generates public/forbidden-9x9.bin at build/dev time.
// Format: magic u32 0x4b594442 ("KYDB"), version u32=1, boardSize u32=9,
// count u32, then count x (a,b,c,d) uint8 with a<b<c (completion triples).
import { writeFileSync } from "node:fs";

const N = 9;
const V = 81;

function det3(m) {
  return (
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  );
}

function forbidden(a, b, c, d) {
  const ids = [a, b, c, d];
  const m = ids.map((id) => {
    const x = id % N;
    const y = Math.floor(id / N);
    return [x * x + y * y, x, y, 1];
  });
  let det = 0;
  for (let col = 0; col < 4; col++) {
    const z = [];
    for (let r = 1; r < 4; r++) {
      const row = [];
      for (let c2 = 0; c2 < 4; c2++) if (c2 !== col) row.push(m[r][c2]);
      z.push(row);
    }
    det += (col % 2 === 0 ? 1 : -1) * m[0][col] * det3(z);
  }
  return det === 0;
}

const triples = new Map();
const key = (a, b, c) => (a * V + b) * V + c;
let quads = 0;
for (let a = 0; a < V; a++)
  for (let b = a + 1; b < V; b++)
    for (let c = b + 1; c < V; c++)
      for (let d = c + 1; d < V; d++) {
        if (!forbidden(a, b, c, d)) continue;
        quads++;
        const q = [a, b, c, d];
        for (let omit = 0; omit < 4; omit++) {
          const t = q.filter((_, j) => j !== omit);
          const k = key(t[0], t[1], t[2]);
          let s = triples.get(k);
          if (!s) {
            s = new Set();
            triples.set(k, s);
          }
          s.add(q[omit]);
        }
      }

console.log(`forbidden quadruples: ${quads}`);
if (quads !== 29152) {
  console.error(`expected 29152, got ${quads}`);
  process.exit(1);
}

const entries = [];
for (const [k, set] of triples) {
  const c = k % V;
  const b = Math.floor(k / V) % V;
  const a = Math.floor(k / (V * V));
  for (const d of set) entries.push([a, b, c, d]);
}
entries.sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2] || p[3] - q[3]);

const buf = Buffer.alloc(16 + entries.length * 4);
buf.writeUInt32LE(0x4b594442, 0);
buf.writeUInt32LE(1, 4);
buf.writeUInt32LE(9, 8);
buf.writeUInt32LE(entries.length, 12);
entries.forEach((e, i) => {
  buf[16 + i * 4] = e[0];
  buf[16 + i * 4 + 1] = e[1];
  buf[16 + i * 4 + 2] = e[2];
  buf[16 + i * 4 + 3] = e[3];
});
writeFileSync("public/forbidden-9x9.bin", buf);
console.log(`wrote public/forbidden-9x9.bin (${buf.length} bytes, ${entries.length} triples)`);
