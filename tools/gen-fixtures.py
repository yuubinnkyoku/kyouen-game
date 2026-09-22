"""Generate tests/fixtures/hash-fixtures.json used by both native and TS hash tests.

Covers: empty, center-only, corners, full-ish states, and specific WIN states.
"""
import json
import os

MASK64 = (1 << 64) - 1
MIX1 = 0xBF58476D1CE4E5B9
MIX2 = 0x94D049BB133111EB
HIM = 0x9E3779B97F4A7C15


def mix64(x: int) -> int:
    v = x & MASK64
    v = (v ^ (v >> 30)) & MASK64
    v = (v * MIX1) & MASK64
    v = (v ^ (v >> 27)) & MASK64
    v = (v * MIX2) & MASK64
    return (v ^ (v >> 31)) & MASK64


def pts(points):
    lo = 0
    hi = 0
    for p in points:
        if p < 64:
            lo |= 1 << p
        else:
            hi |= 1 << (p - 64)
    return lo, hi


cases = [
    ("empty", []),
    ("center", [40]),
    ("corners", [0, 8, 72, 80]),
    ("row0", list(range(9))),
    ("diag", [i * 10 for i in range(9)]),
    ("sparse", [0, 40, 80, 13, 67]),
    ("halffull", list(range(40))),
    ("after-center-plus-corner", [40, 0]),
]
out = []
for name, p in cases:
    lo, hi = pts(p)
    key = (lo ^ ((hi * HIM) & MASK64)) & MASK64
    out.append({"name": name, "lo": str(lo), "hi": hi, "shard": mix64(key) & 0xFF, "mix": str(mix64(key))})

os.makedirs("tests/fixtures", exist_ok=True)
with open("tests/fixtures/hash-fixtures.json", "w") as f:
    json.dump(out, f, indent=2)
print(f"wrote {len(out)} fixtures")
