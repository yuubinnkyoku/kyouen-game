import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const TAG = process.env.KYOuen_TAG || "strategy-v1";
const REPO = "yuubinnkyoku/kyouen-game";

async function main() {
  mkdirSync("dist/strategy", { recursive: true });
  const api = `https://api.github.com/repos/${REPO}/releases/tags/${TAG}`;
  console.log(`resolving ${api}`);
  let assetUrls = [];
  try {
    const res = await fetch(api, { headers: { "User-Agent": "kyouen-game-build" } });
    if (!res.ok) throw new Error(`release API ${res.status}`);
    const rel = await res.json();
    assetUrls = rel.assets.map((a) => ({ name: a.name, url: a.browser_download_url }));
    console.log(`found ${assetUrls.length} assets`);
  } catch (e) {
    console.log(`release fetch failed (${e}), falling back to local .strategy`);
  }
  if (assetUrls.length === 0) {
    if (!existsSync(".strategy/manifest.json")) {
      console.log("no local .strategy/manifest.json; skipping vendor (dev will use proxy)");
      return;
    }
    if (process.platform === "win32") {
      execFileSync("xcopy", [".strategy", "dist\\strategy\\", "/E", "/Y", "/I"], { stdio: "inherit" });
    } else {
      for (const f of readdirSync(".strategy")) copyFileSync(`.strategy/${f}`, `dist/strategy/${f}`);
    }
    const manifest = JSON.parse(readFileSync("dist/strategy/manifest.json", "utf8"));
    console.log(`vendored ${manifest.shards.length} local shards into dist/strategy`);
    return;
  }
  for (const a of assetUrls) {
    const res = await fetch(a.url, { headers: { "User-Agent": "kyouen-game-build" } });
    if (!res.ok) throw new Error(`asset ${a.name}: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(`dist/strategy/${a.name}`, buf);
  }
  const manifest = JSON.parse(readFileSync("dist/strategy/manifest.json", "utf8"));
  console.log(`vendored ${manifest.shards.length} shards into dist/strategy`);
}

void main();
