# Strategy format (strategy-v1)

Third-party implementable spec for the proven-strategy shards served with this game.

## Concepts

- Board: 9×9, point id `p = y*9 + x`, `x = p % 9`, `y = p / 9`. Center is id 40.
- State: 81-bit occupancy mask as `(hi, lo)` where `lo` is the low 64 bits (points 0..63)
  and `hi` holds points 64..80 in its low 17 bits.
- Canonical state: numeric minimum of `(hi, lo)` lexicographic order over the 8 D4 images.
  D4 kinds (matching the C++ checker):
  0 identity, 1 flip-H `(n-1-x,y)`, 2 flip-V `(x,n-1-y)`, 3 rot180,
  4 transpose `(y,x)`, 5 `(n-1-y,x)`, 6 `(y,n-1-x)`, 7 anti-transpose.
- Witness: for a WIN canonical state, the canonical-frame point id (0..80) that moves to
  a smaller-rank LOSS state. Decode to the real board point with the inverse of the
  forward transform chosen by canonicalize.

## Hash / shard

All arithmetic is unsigned 64-bit (mod 2^64):

```
key    = lo ^ (hi * 0x9e3779b97f4a7c15)
mix64(x):
  x ^= x >> 30;  x *= 0xbf58476d1ce4e5b9
  x ^= x >> 27;  x *= 0x94d049bb133111eb
  x ^= x >> 31;  return x
shard  = mix64(key) & 0xff
```

The shard file name is `%02x.bin` (00..ff). Fixtures: `tests/fixtures/hash-fixtures.json`
(python `tools/gen-fixtures.py` generates them; TS `shardOf` must match).

## Record

Fixed 11 bytes, little-endian:

```
bytes 0..7 : lo uint64 LE
bytes 8..10: meta uint24 LE = hi | (witness << 17)
             hi = meta & 0x1FFFF (low 17 bits)
             witness = meta >> 17 (0..80)
```

Records in each shard are sorted ascending by `(hi, lo)`.

## Shard file

16-byte header + `count * 11` bytes:

```
offset 0: magic u32 LE = 0x534b5944 ("SKYD")
offset 4: format version u16 LE = 1
offset 6: shard id u8
offset 7: record size u8 = 11
offset 8: record count u64 LE
```

Validation: magic, version, shard id, record size, and `16 + count*11 == file size`.
SHA-256 of every shard is listed in `manifest.json`.

## Lookup procedure

```
raw state -> canonicalize -> (canon, transform)
shard = shardOf(canon.lo, canon.hi)
fetch <base>/<shard:02x>.bin (cache it; verify SHA-256 + header on first fetch)
witness_canon = binary_search(shard, key=(canon.hi, canon.lo))
point = inverseTransform(transform)[witness_canon]
play point (it is legal by construction; re-check legality in the client)
```

Empty board is special-cased: play 40 without any fetch (root witness is 40).

## Manifest

`strategy/manifest.json` carries `formatVersion`, `boardSize` (9), `shardCount` (256),
`firstMove` (40), `totalRecords` (8826458), `totalBytes`, `source` (repo/commit/SHAs),
`hash`, `record`, per-shard `id/filename/records/bytes/sha256`, and `statistics`.
