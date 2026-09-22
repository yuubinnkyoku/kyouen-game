import { BoardBits, CENTER_ID, POINT_COUNT, canonicalize, inverseWitness, shardOf } from "./core";
import type { Engine } from "./engine";
import { lookupWitness, parseShardHeader, validateShardHeader } from "./strategy";

export const MANIFEST_PATH = "strategy/manifest.json";
export const STRATEGY_VERSION = "strategy-v1";

export interface ManifestShard {
  id: string;
  filename: string;
  records: number;
  bytes: number;
  sha256: string;
}

export interface Manifest {
  formatVersion: number;
  boardSize: number;
  shardCount: number;
  firstMove: number;
  totalRecords: number;
  totalBytes: number;
  strategyBaseUrl?: string;
  source: {
    repository: string;
    commit: string;
    rawCertificateSha256: string;
    compressedCertificateSha256: string;
  };
  hash: { algorithm: string; version: number };
  record: { format: string; bytesPerRecord: number };
  shards: ManifestShard[];
}

export class StrategyStore {
  private manifest: Manifest | null = null;
  private cache = new Map<number, { bytes: Uint8Array; count: number }>();
  private baseUrl: string;
  fetches = 0;
  bytesFetched = 0;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async loadManifest(url: string): Promise<Manifest> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`manifest fetch failed: ${res.status}`);
    this.manifest = (await res.json()) as Manifest;
    if (this.manifest.boardSize !== 9) throw new Error("manifest boardSize != 9");
    if (this.manifest.shardCount !== 256) throw new Error("manifest shardCount != 256");
    return this.manifest;
  }

  get shardCount(): number {
    return this.cache.size;
  }

  private async sha256Hex(data: Uint8Array): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", data as unknown as BufferSource);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  async fetchShard(id: number): Promise<{ bytes: Uint8Array; count: number }> {
    const hit = this.cache.get(id);
    if (hit) return hit;
    if (!this.manifest) throw new Error("manifest not loaded");
    const meta = this.manifest.shards[id];
    if (!meta) throw new Error(`no manifest entry for shard ${id}`);
    const hex = id.toString(16).padStart(2, "0");
    const url = `${this.baseUrl}/${hex}.bin`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`shard ${hex} fetch failed: ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length !== meta.bytes) throw new Error(`shard ${hex} size mismatch`);
    const hexDigest = await this.sha256Hex(buf);
    if (hexDigest !== meta.sha256) throw new Error(`shard ${hex} checksum mismatch`);
    const header = parseShardHeader(new DataView(buf.buffer, buf.byteOffset, buf.byteLength));
    validateShardHeader(header, id, buf.length);
    if (header.count !== meta.records) throw new Error(`shard ${hex} record count mismatch`);
    const entry = { bytes: buf, count: header.count };
    this.cache.set(id, entry);
    this.fetches++;
    this.bytesFetched += buf.length;
    return entry;
  }

  async witnessFor(state: BoardBits): Promise<{ witness: number; shard: number; canonHi: number; canonLo: bigint }> {
    const { canon } = canonicalize(state);
    const hi = Number(canon.hi);
    const shard = shardOf(canon.lo, canon.hi);
    const entry = await this.fetchShard(shard);
    const w = lookupWitness(entry.bytes, entry.count, hi, canon.lo);
    if (w < 0 || w >= POINT_COUNT) throw new Error(`strategy miss (shard ${shard.toString(16).padStart(2, "0")})`);
    return { witness: w, shard, canonHi: hi, canonLo: canon.lo };
  }
}

export interface CpuMove {
  point: number;
  shard: number | null;
  canonHi: number | null;
  canonLo: bigint | null;
  transform: number | null;
}

/** CPU move: center on empty board, otherwise canonicalize -> witness -> inverse transform. */
export async function cpuMove(
  state: BoardBits,
  store: StrategyStore,
  engine: Engine,
): Promise<CpuMove> {
  let empty = true;
  for (let p = 0; p < POINT_COUNT; p++) {
    const bit = p < 64 ? (state.lo >> BigInt(p)) & 1n : (state.hi >> BigInt(p - 64)) & 1n;
    if (bit) { empty = false; break; }
  }
  if (empty) return { point: CENTER_ID, shard: null, canonHi: null, canonLo: null, transform: null };
  const { canon, transform } = canonicalize(state);
  const hi = Number(canon.hi);
  const shard = shardOf(canon.lo, canon.hi);
  const { witness } = await store.witnessFor(state);
  const point = inverseWitness(transform, witness);
  if (!engine.isLegal(state, point)) throw new Error(`strategy witness ${point} is illegal`);
  return { point, shard, canonHi: hi, canonLo: canon.lo, transform };
}
