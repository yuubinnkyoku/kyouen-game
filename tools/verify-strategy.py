"""Full strategy verification: sort order, shard ids, witness match, binary search.

Usage: python tools/verify-strategy.py <certPath> <strategyDir>
Streams the certificate once, checking every WIN record against its shard.
Memory-light: one shard binary at a time + small index.
"""
import hashlib
import json
import struct
import sys

import zstandard

MASK64 = (1 << 64) - 1
MIX1 = 0xBF58476D1CE4E5B9
MIX2 = 0x94D049BB133111EB
HIM = 0x9E3779B97F4A7C15
RB = 11
HB = 16


def mix64(x: int) -> int:
    v = x & MASK64
    v = (v ^ (v >> 30)) & MASK64
    v = (v * MIX1) & MASK64
    v = (v ^ (v >> 27)) & MASK64
    v = (v * MIX2) & MASK64
    return (v ^ (v >> 31)) & MASK64


def shard_of(lo: int, hi: int) -> int:
    return mix64((lo ^ ((hi * HIM) & MASK64)) & MASK64) & 0xFF


def lookup(blob: bytes, count: int, hi: int, lo: int) -> int:
    a, b = 0, count
    while a < b:
        m = (a + b) >> 1
        o = HB + m * RB
        mlo = struct.unpack("<Q", blob[o:o + 8])[0]
        meta = blob[o + 8] | (blob[o + 9] << 8) | (blob[o + 10] << 16)
        mhi = meta & 0x1FFFF
        if (mhi, mlo) < (hi, lo):
            a = m + 1
        elif (mhi, mlo) > (hi, lo):
            b = m
        else:
            return meta >> 17
    return -1


def main() -> None:
    cert_path, sdir = sys.argv[1], sys.argv[2]
    manifest = json.load(open(f"{sdir}/manifest.json"))
    assert manifest["totalRecords"] == 8826458
    assert len(manifest["shards"]) == 256

    blobs = {}
    for s in manifest["shards"]:
        blob = open(f"{sdir}/{s['id']}.bin", "rb").read()
        assert hashlib.sha256(blob).hexdigest() == s["sha256"], s["id"]
        magic, ver, sid, rb, n = struct.unpack("<IHBBQ", blob[:HB])
        assert magic == 0x534B5944 and ver == 1 and sid == int(s["id"], 16) and rb == 11 and n == s["records"]
        assert HB + n * RB == len(blob) == s["bytes"], s["id"]
        # sorted check
        prev = None
        for i in range(n):
            o = HB + i * RB
            mlo = struct.unpack("<Q", blob[o:o + 8])[0]
            meta = blob[o + 8] | (blob[o + 9] << 8) | (blob[o + 10] << 16)
            key = ((meta & 0x1FFFF), mlo)
            if prev is not None:
                assert prev < key, f"unsorted shard {s['id']} at {i}"
            prev = key
        blobs[s["id"]] = (blob, n)
    print("all 256 shard headers/checksums/sort orders OK", flush=True)

    NODE = struct.Struct("<QI4B")
    dctx = zstandard.ZstdDecompressor()
    stream = dctx.stream_reader(open(cert_path, "rb"))
    header = stream.read(40)
    magic, ver, bs, nc, rlo, rhi, fc = struct.unpack("<8sIIQQII", header)
    assert magic == b"KYOENC3\x00" and ver == 3 and bs == 9 and nc == 13457134 and fc == 29152
    seen = set()
    win = 0
    checked = 0
    buf = b""
    while True:
        chunk = stream.read(1 << 22)
        if chunk:
            buf += chunk
        if len(buf) < 16 and chunk:
            continue
        n = len(buf) // 16
        for i in range(n):
            lo, hi, oc, wit, rank, rsv = NODE.unpack_from(buf, i * 16)
            if oc == 2:
                win += 1
                assert (hi, lo) not in seen, "duplicate WIN state"
                seen.add((hi, lo))
                sid = shard_of(lo, hi)
                blob, cnt = blobs[f"{sid:02x}"]
                got = lookup(blob, cnt, hi, lo)
                assert got == wit, f"witness mismatch shard={sid:02x}"
                checked += 1
                if checked % 1000000 == 0:
                    print(f"  verified {checked} WIN records...", flush=True)
        buf = buf[n * 16:]
        if not chunk:
            break
    assert win == 8826458 == checked
    print(f"VERIFIED: {checked} WIN records match shards, 0 duplicates, all sorted", flush=True)


main()
