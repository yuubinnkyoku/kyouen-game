import { mkdirSync, writeFileSync } from "node:fs";

const TAG = process.env.KYOuen_TAG || "strategy-v1";
const REPO = "yuubinnkyoku/kyouen-game";
mkdirSync(".strategy", { recursive: true });
const api = `https://api.github.com/repos/${REPO}/releases/tags/${TAG}`;
console.log(`fetching strategy ${TAG} into .strategy/`);
const rel = await (await fetch(api, { headers: { "User-Agent": "kyouen-game" } })).json();
for (const a of rel.assets) {
  const res = await fetch(a.browser_download_url, { headers: { "User-Agent": "kyouen-game" } });
  if (!res.ok) throw new Error(`${a.name}: ${res.status}`);
  writeFileSync(`.strategy/${a.name}`, Buffer.from(await res.arrayBuffer()));
  console.log(` - ${a.name}`);
}
console.log("done");
