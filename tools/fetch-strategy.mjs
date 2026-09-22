import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const TAG = process.env.KYOuen_TAG || "strategy-v1";
const REPO = "yuubinnkyoku/kyouen-game";
mkdirSync(".strategy", { recursive: true });
console.log(`fetching strategy ${TAG} into .strategy/ via gh release download`);
const maxAttempts = 5;
for (let attempt = 1; ; attempt++) {
  try {
    execFileSync("gh", ["release", "download", TAG, "-R", REPO, "--clobber", "--dir", ".strategy"], {
      stdio: "inherit",
      env: { ...process.env, GH_TOKEN: process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "" },
    });
    break;
  } catch (e) {
    if (attempt >= maxAttempts) throw e;
    const waitMs = attempt * 30000;
    console.log(`attempt ${attempt} failed, retrying in ${waitMs / 1000}s...`);
    execFileSync(process.platform === "win32" ? "powershell" : "sleep", process.platform === "win32" ? ["-Command", `Start-Sleep ${waitMs / 1000}`] : [String(waitMs / 1000)], { stdio: "inherit" });
  }
}
console.log("done");
