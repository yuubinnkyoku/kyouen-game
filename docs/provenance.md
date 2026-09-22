# Provenance

## Research source

- repository: https://github.com/yuubinnkyoku/kyouen-1-to-9-classification
- source commit: `224f0dae89f95bfafa20290e872d96b9567dc6d7`
- spec: `docs/CERTIFICATE_FORMAT.md`, checker `cpp/certificate/kyouen_certcheck.cpp` at that commit

## Certificate release (v1.0.0)

- asset: `kyouen-certificates-1-to-9-v1.0.0.zip`
- ZIP SHA-256: `84454543f7e054e42779792b10c430d539ab6dd26c60b46d091cf4770dde7707`
- 9×9 compressed `kyouen-9x9.cert.zst` SHA-256: `cbaaaa287696498fa74651fb31526f65c996202854dbe8c9807085eeeb2ad952`
- decompressed KYOENC3 SHA-256: `f4282bebbf8240cd0a11fdd5af78ef8b1e33f0b9582f72424574c1bab5ac92e2`
- header: magic `KYOENC3`, version 3, boardSize 9, nodeCount 13457134, root (0,0), forbidden 29152
- nodes: total 13,457,134; LOSS 4,630,676; WIN 8,826,458
- raw bytes: 215,314,184; root outcome WIN, root witness 40

## Export tool

- `tools/export-strategy.mjs` (orchestration: download → SHA checks → extract) +
  `tools/export-shards.py` (streaming zstd decode → per-shard temp files → sort → binaries + manifest)
- streaming design: the 13.4M-node certificate is never held in RAM as a whole
- hash: `mix64`/`stateKey` as in `docs/strategy-format.md` (matches C++ checker `OutcomeTable::hash`)
- record: 11 bytes (`lo:u64LE + meta:u24LE`), per-shard `(hi,lo)` ascending sort
- shard header: magic `0x534b5944`, version 1, shard id, record size 11, count u64

## Strategy release

- tag: `strategy-v1` on `yuubinnkyoku/kyouen-game`
- assets: `manifest.json` + `00.bin`…`ff.bin` (257 assets)
- total records: 8,826,458; shard count: 256
- generation command: `node tools/export-strategy.mjs` (env `KYOuen_WORK`, `KYOuen_OUT`, `KYOuen_TAG`)
- verification command: `python tools/verify-strategy.py .strategy-work/kyouen-9x9.cert.zst .strategy`
- verification: WIN count 8,826,458, 0 duplicate states, all shard ids correct,
  all shards sorted, every witness matches the source certificate, all checksums match,
  binary search re-fetches every record.

## Distribution decision

- Strategy shards are NOT committed to git history.
- Pages deployment vendors the pinned `strategy-v1` Release assets into `dist/strategy/`
  (same-origin serving). Reason: GitHub Release direct fetch from the Pages origin was
  not relied upon without a verified browser check; same-origin is deterministic and
  cache-friendly.
