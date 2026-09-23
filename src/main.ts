import { createEngineFromCompletion } from "./engine";
import { GameController } from "./controller";
import { MANIFEST_PATH, StrategyStore } from "./game";
import { createUI, type UIRefs } from "./ui";

function basePath(): string {
  const base = import.meta.env.BASE_URL as string;
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

async function loadForbidden(): Promise<bigint[]> {
  const url = `${basePath()}/forbidden-9x9.bin`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`forbidden table fetch failed: ${res.status}`);
  const buf = await res.arrayBuffer();
  const view = new DataView(buf);
  if (view.getUint32(0, true) !== 0x4b594442) throw new Error("forbidden table bad magic");
  if (view.getUint32(4, true) !== 1) throw new Error("forbidden table bad version");
  if (view.getUint32(8, true) !== 9) throw new Error("forbidden table bad version");
  const count = view.getUint32(12, true);
  if (16 + count * 4 !== buf.byteLength) throw new Error("forbidden table size mismatch");
  const triples = new Array<bigint>(81 * 81 * 81).fill(0n);
  let off = 16;
  for (let i = 0; i < count; i++) {
    const a = view.getUint8(off)!;
    const b = view.getUint8(off + 1)!;
    const c = view.getUint8(off + 2)!;
    const d = view.getUint8(off + 3)!;
    off += 4;
    triples[(a * 81 + b) * 81 + c]! |= 1n << BigInt(d);
  }
  return triples;
}

function refs(): UIRefs {
  const $ = <T extends HTMLElement>(id: string): T => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`missing #${id}`);
    return el as T;
  };
  return {
    board: $("board"),
    circleLayer: $("circleLayer") as unknown as SVGSVGElement,
    turnLabel: $("turnLabel"),
    handLabel: $("handLabel"),
    fetchLabel: $("fetchLabel"),
    coordLabel: $("coordLabel"),
    undoBtn: $("undoBtn") as HTMLButtonElement,
    redoBtn: $("redoBtn") as HTMLButtonElement,
    resetBtn: $("resetBtn") as HTMLButtonElement,
    retryBtn: $("retryBtn") as HTMLButtonElement,
    hintToggle: $("hintToggle") as HTMLInputElement,
    resultToggle: $("resultToggle") as HTMLInputElement,
    soundToggle: $("soundToggle") as HTMLInputElement,
    dCanon: $("dCanon"),
    dShard: $("dShard"),
    dStrategy: $("dStrategy"),
    dFetch: $("dFetch"),
  };
}

async function main(): Promise<void> {
  const r = refs();
  r.turnLabel.textContent = "盤面を読み込み中…";
  let table: bigint[];
  try {
    table = await loadForbidden();
  } catch (e) {
    r.turnLabel.textContent = `盤面データの取得に失敗しました: ${e instanceof Error ? e.message : e}`;
    r.fetchLabel.hidden = false;
    r.fetchLabel.textContent = String(e instanceof Error ? e.message : e);
    return;
  }
  const engine = createEngineFromCompletion(table);
  const store = new StrategyStore(`${basePath()}/strategy`);
  const game = new GameController(engine, store, {
    onChange: () => ui.render(),
    onNeedRetry: () => ui.render(),
  });
  const ui = createUI(r, game, engine, store);
  try {
    await store.loadManifest(`${basePath()}/${MANIFEST_PATH}`);
  } catch (e) {
    r.turnLabel.textContent = `strategy manifestの取得に失敗しました: ${e instanceof Error ? e.message : e}`;
    r.fetchLabel.hidden = false;
    r.fetchLabel.textContent = String(e instanceof Error ? e.message : e);
    return;
  }
  game.reset();
  ui.render();
  (window as unknown as { __kyouen: unknown }).__kyouen = { game, engine, store, ui };
}

void main();
