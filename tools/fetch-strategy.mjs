import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const TAG = process.env.KYOuen_TAG || "strategy-v1";
const REPO = "yuubinnkyoku/kyouen-game";
mkdirSync(".strategy", { recursive: true });
console.log(`fetching strategy ${TAG} into .strategy/ via gh release download`);
execFileSync("gh", ["release", "download", TAG, "-R", REPO, "--clobber", "--dir", ".strategy"], {
  stdio: "inherit",
});
console.log("done");
