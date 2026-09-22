import { existsSync, mkdirSync, readFileSync, copyFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const TAG = process.env.KYOuen_TAG || "strategy-v1";
const REPO = "yuubinnkyoku/kyouen-game";

async function main() {
  mkdirSync("dist/strategy", { recursive: true });
  // Prefer the local .strategy dir when present (CI fetches it first with retries).
  if (existsSync(".strategy/manifest.json")) {
    if (process.platform === "win32") {
      execFileSync("xcopy", [".strategy", "dist\\strategy\\", "/E", "/Y", "/I"], { stdio: "inherit" });
    } else {
      for (const f of readdirSync(".strategy")) copyFileSync(`.strategy/${f}`, `dist/strategy/${f}`);
    }
    const manifest = JSON.parse(readFileSync("dist/strategy/manifest.json", "utf8"));
    console.log(`vendored ${manifest.shards.length} local shards into dist/strategy`);
    return;
  }
  // Fallback: download pinned release assets with retries.
  const { writeFileSync } = await import("node:fs");
  const maxAttempts = 5;
  for (let attempt = 1; ; attempt++) {
    try {
      execFileSync("gh", ["release", "download", TAG, "-R", REPO, "--clobber", "--dir", "dist/strategy"], {
        stdio: "inherit",
        env: { ...process.env, GH_TOKEN: process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "" },
      });
      break;
    } catch (e) {
      if (attempt >= maxAttempts) throw e;
      console.log(`attempt ${attempt} failed, retrying...`);
      await new Promise((r) => setTimeout(r, attempt * 30000));
    }
  }
  const manifest = JSON.parse(readFileSync("dist/strategy/manifest.json", "utf8"));
  console.log(`vendored ${manifest.shards.length} shards into dist/strategy`);
  void writeFileSync;
}

void main();
