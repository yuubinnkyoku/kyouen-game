"""Unzip a single member from a large zip without extracting everything."""
import sys
import zipfile

zip_path, member, dest = sys.argv[1], sys.argv[2], sys.argv[3]
with zipfile.ZipFile(zip_path) as z:
    with z.open(member) as src, open(dest, "wb") as out:
        while True:
            chunk = src.read(1 << 22)
            if not chunk:
                break
            out.write(chunk)
print(f"extracted {member} -> {dest}")
