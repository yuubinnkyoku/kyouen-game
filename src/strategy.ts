import { POINT_COUNT } from "./core";

export const SHARD_MAGIC = 0x534b5944;
export const SHARD_FORMAT_VERSION = 1;
export const RECORD_BYTES = 11;
export const HEADER_BYTES = 16;

export interface ShardHeader {
  magic: number;
  version: number;
  shard: number;
  recordBytes: number;
  count: number;
}

export function parseShardHeader(view: DataView): ShardHeader {
  const magic = view.getUint32(0, true);
  const version = view.getUint16(4, true);
  const shard = view.getUint8(6);
  const recordBytes = view.getUint8(7);
  const count = Number(view.getBigUint64(8, true));
  return { magic, version, shard, recordBytes, count };
}

export function validateShardHeader(h: ShardHeader, expectedShard: number, byteLength: number): void {
  if (h.magic !== SHARD_MAGIC) throw new Error(`bad magic: ${h.magic.toString(16)}`);
  if (h.version !== SHARD_FORMAT_VERSION) throw new Error(`bad version: ${h.version}`);
  if (h.shard !== expectedShard) throw new Error(`shard mismatch: got ${h.shard}, want ${expectedShard}`);
  if (h.recordBytes !== RECORD_BYTES) throw new Error(`bad record size: ${h.recordBytes}`);
  if (HEADER_BYTES + h.count * RECORD_BYTES !== byteLength)
    throw new Error(`size mismatch: count=${h.count} bytes=${byteLength}`);
}

export interface StrategyRecord {
  lo: bigint;
  hi: number;
  witness: number;
}

function readU64LE(bytes: Uint8Array, off: number): bigint {
  let v = 0n;
  for (let i = 0; i < 8; i++) v |= BigInt(bytes[off + i]!) << BigInt(8 * i);
  return v;
}

export function decodeRecord(bytes: Uint8Array, index: number): StrategyRecord {
  const off = HEADER_BYTES + index * RECORD_BYTES;
  const lo = readU64LE(bytes, off);
  const meta = bytes[off + 8]! | (bytes[off + 9]! << 8) | (bytes[off + 10]! << 16);
  const hi = meta & 0x1ffff;
  const witness = meta >>> 17;
  if (witness >= POINT_COUNT) throw new Error(`bad witness ${witness}`);
  return { lo, hi, witness };
}

function cmpKey(ahi: number, alo: bigint, bhi: number, blo: bigint): number {
  if (ahi !== bhi) return ahi < bhi ? -1 : 1;
  if (alo !== blo) return alo < blo ? -1 : 1;
  return 0;
}

/** Binary search over (hi,lo)-sorted records. Returns witness or -1. */
export function lookupWitness(bytes: Uint8Array, count: number, hi: number, lo: bigint): number {
  let loIx = 0;
  let hiIx = count;
  while (loIx < hiIx) {
    const mid = (loIx + hiIx) >>> 1;
    const off = HEADER_BYTES + mid * RECORD_BYTES;
    const mlo = readU64LE(bytes, off);
    const meta = bytes[off + 8]! | (bytes[off + 9]! << 8) | (bytes[off + 10]! << 16);
    const mhi = meta & 0x1ffff;
    const c = cmpKey(mhi, mlo, hi, lo);
    if (c < 0) loIx = mid + 1;
    else if (c > 0) hiIx = mid;
    else return meta >>> 17;
  }
  return -1;
}
