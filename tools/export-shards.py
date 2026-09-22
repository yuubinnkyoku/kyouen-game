"""Stream-export 256 strategy shards from the 9x9 KYOENC3 certificate.

Memory strategy: never hold all 13.4M nodes in RAM. Stream the decompressed
certificate, bucket WIN records per shard into temp files on disk, then sort
each shard externally (via chunk sort + merge) and write final binaries.
"""
import hashlib
import json
import os
import struct
import sys
import tempfile

import zstandard

MASK64 = (1 << 64) - 1
MIX1 = 0xBF58476D1CE4E5B9
MIX2 = 0x94D049BB133111EB
HIM = 0x9E3779B97F4A7C15

SHARD_MAGIC = 0x534B5944
SHARD_VERSION = 1
RECORD_BYTES = 11
HEADER_BYTES = 16

EXPECTED_RAW_SHA = sys.argv[2]
OUT_DIR = sys.argv[3]
TAG = sys.argv[4]
ZST_PATH = sys.argv[1]


def mix64(x: int) -> int:
    v = x & MASK64
    v = (v ^ (v >> 30)) & MASK64
    v = (v * MIX1) & MASK64
    v = (v ^ (v >> 27)) & MASK64
    v = (v * MIX2) & MASK64
    return (v ^ (v >> 31)) & MASK64


def shard_of(lo: int, hi: int) -> int:
    key = (lo ^ ((hi * HIM) & MASK64)) & MASK64
    return mix64(key) & 0xFF


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    tmpdir = tempfile.mkdtemp(prefix="kyouen-shards-")
    print(f"tmpdir={tmpdir}", flush=True)

    dctx = zstandard.ZstdDecompressor()
    hasher = hashlib.sha256()
    header_read = False
    node_count = 0
    board_size = 0
    win_total = 0
    root_witness = None
    handles = []
    for i in range(256):
        handles.append(open(os.path.join(tmpdir, f"{i:02x}.tmp"), "wb"))

    carry = b""
    stream = dctx.stream_reader(open(ZST_PATH, "rb"))
    offset = 0
    NODE = struct.Struct("<QI4B")
    while True:
        chunk = stream.read(1 << 22)
        if not chunk:
            break
        hasher.update(chunk)
        buf = carry + chunk
        pos = 0
        if not header_read:
            if len(buf) < 40:
                carry = buf
                continue
            magic, ver, board_size, node_count, rlo, rhi, fc = struct.unpack("<8sIIQQII", buf[:40])
            assert magic == b"KYOENC3\x00", magic
            assert ver == 3, ver
            assert board_size == 9, board_size
            assert node_count == 13457134, node_count
            assert rlo == 0 and rhi == 0, (rlo, rhi)
            assert fc == 29152, fc
            print(f"header ok: nodes={node_count} forbidden={fc}", flush=True)
            header_read = True
            pos = 40
        start_node = (offset + pos - 40) // 16 if offset + pos >= 40 else 0
        _ = start_node
        # process whole nodes
        avail = (len(buf) - pos) // 16
        for i in range(avail):
            o = pos + i * 16
            lo, hi, oc, wit, rank, rsv = NODE.unpack_from(buf, o)
            assert rsv == 0
            if oc == 2:
                assert wit < 81
                assert rank == 81 - (bin(lo).count("1") + bin(hi).count("1"))
                meta = hi | (wit << 17)
                rec = struct.pack("<Q", lo) + bytes((meta & 0xFF, (meta >> 8) & 0xFF, (meta >> 16) & 0xFF))
                s = shard_of(lo, hi)
                handles[s].write(rec)
                win_total += 1
                if lo == 0 and hi == 0:
                    root_witness = wit
            elif oc == 1:
                assert wit == 255
            else:
                raise AssertionError(f"bad outcome {oc}")
        consumed = pos + avail * 16
        carry = buf[consumed:]
        offset += len(chunk)
    for h in handles:
        h.close()

    raw_sha = hasher.hexdigest()
    print(f"raw sha256: {raw_sha}", flush=True)
    if raw_sha != EXPECTED_RAW_SHA:
        raise SystemExit("raw certificate checksum mismatch")
    print(f"win_total={win_total} root_witness={root_witness}", flush=True)
    if win_total != 8826458:
        raise SystemExit(f"WIN count mismatch: {win_total}")
    if root_witness != 40:
        raise SystemExit(f"root witness mismatch: {root_witness}")

    shards_meta = []
    total_bytes = 0
    for s in range(256):
        path = os.path.join(tmpdir, f"{s:02x}.tmp")
        with open(path, "rb") as f:
            data = f.read()
        n = len(data) // RECORD_BYTES
        assert len(data) % RECORD_BYTES == 0
        # sort by (hi, lo): meta low 17 bits = hi, lo = u64 LE
        recs = [data[i * RECORD_BYTES:(i + 1) * RECORD_BYTES] for i in range(n)]
        recs.sort(key=lambda r: (r[8] | (r[9] << 8) | ((r[10] & 0x01) << 16), struct.unpack("<Q", r[:8])[0], r[8] | (r[9] << 8) | (r[10] << 16)))
        # The sort key above: full meta for tiebreak is overkill; (hi,lo) primary. Re-sort strictly:
        recs.sort(key=lambda r: ((r[8] | (r[9] << 8) | (r[10] << 16)) & 0x1FFFF, struct.unpack("<Q", r[:8])[0]))
        out_path = os.path.join(OUT_DIR, f"{s:02x}.bin")
        with open(out_path, "wb") as f:
            f.write(struct.pack("<IHBBQ", SHARD_MAGIC, SHARD_VERSION, s, RECORD_BYTES, n))
            for r in recs:
                f.write(r)
        with open(out_path, "rb") as f:
            blob = f.read()
        digest = hashlib.sha256(blob).hexdigest()
        shards_meta.append({"id": f"{s:02x}", "filename": f"{s:02x}.bin", "records": n, "bytes": len(blob), "sha256": digest})
        total_bytes += len(blob)
        os.remove(path)
    os.rmdir(tmpdir)

    byts = sorted(s["bytes"] for s in shards_meta)
    manifest = {
        "formatVersion": 1,
        "boardSize": 9,
        "shardCount": 256,
        "firstMove": 40,
        "totalRecords": win_total,
        "totalBytes": total_bytes,
        "strategyRelease": TAG,
        "source": {
            "repository": "https://github.com/yuubinnkyoku/kyouen-1-to-9-classification",
            "commit": "224f0dae89f95bfafa20290e872d96b9567dc6d7",
            "rawCertificateSha256": EXPECTED_RAW_SHA,
            "compressedCertificateSha256": "cbaaaa287696498fa74651fb31526f65c996202854dbe8c9807085eeeb2ad952",
        },
        "hash": {"algorithm": "mix64(stateKey) & 0xff", "version": 1},
        "record": {"format": "lo:u64LE + meta:u24LE (hi:17bit | witness:7bit<<17)", "bytesPerRecord": 11},
        "shards": shards_meta,
        "statistics": {
            "minShardBytes": byts[0],
            "averageShardBytes": total_bytes // 256,
            "maxShardBytes": byts[-1],
        },
    }
    with open(os.path.join(OUT_DIR, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"manifest written: records={win_total} bytes={total_bytes}", flush=True)


main()
