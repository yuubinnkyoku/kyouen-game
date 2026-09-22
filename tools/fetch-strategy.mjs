import { mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const TAG = process.env.KYOuen_TAG || "strategy-v1";
const REPO = "yuubinnkyoku/kyouen-game";
mkdirSync(".strategy", { recursive: true });
// Single-asset bundle first (1 API call), fall back to per-file download.
console.log(`fetching strategy ${TAG} into .strategy/`);
const env = { ...process.env, GH_TOKEN: process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "" };
const maxAttempts = 6;
let ok = false;
for (let attempt = 1; attempt <= maxAttempts && !ok; attempt++) {
  try {
    execFileSync(
      "gh",
      ["release", "download", TAG, "-R", REPO, "--clobber", "--dir", ".strategy", "--pattern", "*.tar.gz"],
      { stdio: "inherit", env },
    );
    execFileSync("tar", ["-xzf", ".strategy/strategy-bundle.tar.gz", "-C", ".strategy", "--strip-components=1"], {
      stdio: "inherit",
    });
    ok = true;
  } catch (e) {
    console.log(`bundle attempt ${attempt} failed (${e}), retrying...`);
    await new Promise((r) => setTimeout(r, attempt * 30000));
  }
}
if (!ok) {
  console.log("bundle download failed, falling back to per-file download");
  for (let attempt = 1; ; attempt++) {
    try {
      execFileSync("gh", ["release", "download", TAG, "-R", REPO, "--clobber", "--dir", ".strategy"], {
        stdio: "inherit",
        env,
      });
      break;
    } catch (e) {
      if (attempt >= maxAttempts) throw e;
      console.log(`file attempt ${attempt} failed, retrying...`);
      await new Promise((r) => setTimeout(r, attempt * 30000));
    }
  }
}
console.log("done");
