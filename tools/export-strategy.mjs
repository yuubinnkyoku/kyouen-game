import { createWriteStream, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { createReadStream } from "node:fs";
import { execFileSync } from "node:child_process";

const ZIP_SHA = "84454543f7e054e42779792b10c430d539ab6dd26c60b46d091cf4770dde7707";
const ZST_SHA = "cbaaaa287696498fa74651fb31526f65c996202854dbe8c9807085eeeb2ad952";
const RAW_SHA = "f4282bebbf8240cd0a11fdd5af78ef8b1e33f0b9582f72424574c1bab5ac92e2";

function shaFile(path) {
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    createReadStream(path).on("data", (d) => h.update(d)).on("end", () => resolve(h.digest("hex"))).on("error", reject);
  });
}

function downloadWithGh(dest) {
  execFileSync(
    "gh",
    [
      "release",
      "download",
      "v1.0.0",
      "-R",
      "yuubinnkyoku/kyouen-1-to-9-classification",
      "--clobber",
      "--pattern",
      "kyouen-certificates-1-to-9-v1.0.0.zip",
      "--dir",
      dest,
    ],
    { stdio: "inherit" },
  );
}

async function main() {
  const work = process.env.KYOuen_WORK || ".strategy-work";
  const outDir = process.env.KYOuen_OUT || ".strategy";
  const tag = process.env.KYOuen_TAG || "strategy-v1";
  mkdirSync(work, { recursive: true });
  mkdirSync(outDir, { recursive: true });

  const zipPath = `${work}/cert.zip`;
  if (!existsSync(zipPath)) {
    const { renameSync, readdirSync } = await import("node:fs");
    try {
      downloadWithGh(work);
      for (const f of readdirSync(work)) {
        if (f.endsWith(".zip") && f !== "cert.zip") renameSync(`${work}/${f}`, zipPath);
      }
    } catch (e) {
      console.log(`gh download failed (${e}), trying plain fetch`);
    }
    if (!existsSync(zipPath)) {
      // last resort: plain fetch (works when repo/releases are public)
      const url =
        "https://github.com/yuubinnkyoku/kyouen-1-to-9-classification/releases/download/v1.0.0/kyouen-certificates-1-to-9-v1.0.0.zip";
      console.log(`downloading ${url}`);
      const res = await fetch(url);
      if (!res.ok || !res.body) throw new Error(`download failed: ${res.status}`);
      await pipeline(Readable.fromWeb(res.body), createWriteStream(zipPath));
    }
  }
  const zipSha = await shaFile(zipPath);
  console.log(`zip sha256: ${zipSha}`);
  if (zipSha !== ZIP_SHA) throw new Error("ZIP checksum mismatch");

  console.log("extracting 9x9 zst (streaming, no full-zip unpack)...");
  const zstPath = `${work}/kyouen-9x9.cert.zst`;
  if (!existsSync(zstPath)) {
    execFileSync("python", ["tools/unzip-one.py", zipPath, "kyouen-9x9.cert.zst", zstPath], { stdio: "inherit" });
  }
  const zstSha = await shaFile(zstPath);
  console.log(`zst sha256: ${zstSha}`);
  if (zstSha !== ZST_SHA) throw new Error("zst checksum mismatch");

  console.log("decompressing + exporting shards in one streaming pass...");
  execFileSync("python", ["tools/export-shards.py", zstPath, RAW_SHA, outDir, tag], { stdio: "inherit" });

  const manifestRaw = readFileSync(`${outDir}/manifest.json`, "utf8");
  const manifest = JSON.parse(manifestRaw);
  if (manifest.totalRecords !== 8826458) throw new Error(`totalRecords=${manifest.totalRecords}`);
  console.log(`records=${manifest.totalRecords} bytes=${manifest.totalBytes} shards=${manifest.shards.length}`);
  let min = Infinity;
  let max = 0;
  for (const s of manifest.shards) {
    min = Math.min(min, s.bytes);
    max = Math.max(max, s.bytes);
    const got = await shaFile(`${outDir}/${s.id}.bin`);
    if (got !== s.sha256) throw new Error(`shard ${s.id} checksum mismatch`);
  }
  console.log(`shard bytes: min=${min} avg=${Math.round(manifest.totalBytes / 256)} max=${max}`);
  console.log("export OK");
}

void main();
