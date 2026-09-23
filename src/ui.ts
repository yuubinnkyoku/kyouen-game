import { POINT_COUNT } from "./core";
import type { Engine } from "./engine";
import { GameController } from "./controller";
import { circleFromQuad, coordName, type Circle } from "./geometry";

export interface UIRefs {
  board: HTMLElement;
  circleLayer: SVGSVGElement;
  turnLabel: HTMLElement;
  handLabel: HTMLElement;
  fetchLabel: HTMLElement;
  coordLabel: HTMLElement;
  undoBtn: HTMLButtonElement;
  redoBtn: HTMLButtonElement;
  resetBtn: HTMLButtonElement;
  retryBtn: HTMLButtonElement;
  hintToggle: HTMLInputElement;
  resultToggle: HTMLInputElement;
  soundToggle: HTMLInputElement;
  dCanon: HTMLElement;
  dShard: HTMLElement;
  dStrategy: HTMLElement;
  dFetch: HTMLElement;
}

function beep(win: boolean): void {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = win ? 660 : 220;
    g.gain.value = 0.08;
    o.start();
    o.stop(ctx.currentTime + 0.18);
    setTimeout(() => void ctx.close(), 300);
  } catch {
    /* audio unsupported */
  }
}

export function createUI(
  refs: UIRefs,
  game: GameController,
  engine: Engine,
  store: { fetches: number; bytesFetched: number },
): {
  cells: HTMLButtonElement[];
  setHint: (on: boolean) => void;
  setResult: (on: boolean) => void;
  setSound: (on: boolean) => void;
  render: () => void;
} {
  const cells: HTMLButtonElement[] = [];
  let blame: number[] | null = null;
  let endCircles: Circle[] = [];
  let prevOver = false;

  const hintOn = () => refs.hintToggle.checked;
  const resultOn = () => refs.resultToggle.checked;
  const soundOn = () => refs.soundToggle.checked;

  for (let p = 0; p < POINT_COUNT; p++) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "cell";
    b.setAttribute("role", "gridcell");
    b.setAttribute("aria-label", `(${coordName(p)})`);
    b.dataset.point = String(p);
    b.addEventListener("click", () => {
      if (game.over || game.busy || game.turn !== "you") return;
      if (game["state"] && engine.isLegal(game.state, p)) {
        blame = null;
        void game.playYou(p);
      } else if (!engine.isLegal(game.state, p) && !game.stones.has(p)) {
        blame = engine.blameQuad(game.state, p);
        render();
      }
    });
    b.addEventListener("mouseenter", () => {
      refs.coordLabel.textContent = coordName(p);
    });
    b.addEventListener("mouseleave", () => {
      refs.coordLabel.textContent = "—";
    });
    refs.board.appendChild(b);
    cells.push(b);
  }

  function collectEndCircles(): Circle[] {
    if (!game.over) return [];
    const seen = new Set<string>();
    const out: Circle[] = [];
    for (let p = 0; p < POINT_COUNT; p++) {
      if (game.stones.has(p)) continue;
      const quad = engine.blameQuad(game.state, p);
      if (!quad) continue;
      const key = quad
        .slice(0, 3)
        .sort((a, b) => a - b)
        .join(",");
      if (seen.has(key)) continue;
      seen.add(key);
      const c = circleFromQuad(quad);
      if (c) out.push(c);
      if (out.length >= 10) break;
    }
    return out;
  }

  function paintCircles(): void {
    const layer = refs.circleLayer;
    while (layer.firstChild) layer.removeChild(layer.firstChild);
    if (!resultOn()) return;

    const draw = (c: Circle, faint: boolean) => {
      const el = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      el.setAttribute("cx", String(c.cx));
      el.setAttribute("cy", String(c.cy));
      el.setAttribute("r", String(c.r));
      if (faint) el.setAttribute("class", "faint");
      layer.appendChild(el);
    };

    if (blame) {
      const c = circleFromQuad(blame);
      if (c) draw(c, false);
    }
    for (const c of endCircles) draw(c, true);
  }

  function render(): void {
    const legal = new Set(game.legalForYou());
    const showHints = hintOn();
    refs.board.classList.toggle("hint-on", showHints);

    if (game.over && !prevOver) {
      endCircles = collectEndCircles();
      if (soundOn()) beep(game.winner === "you");
    }
    if (!game.over) endCircles = [];
    prevOver = game.over;

    for (let p = 0; p < POINT_COUNT; p++) {
      const c = cells[p]!;
      const side = game.stones.get(p);
      c.classList.toggle("cpu", side === "cpu");
      c.classList.toggle("you", side === "you");
      c.classList.toggle("last", game.lastMove === p);
      c.classList.toggle("hint-ok", showHints && legal.has(p));
      c.classList.toggle("blame", blame !== null && blame.includes(p));
      // Hint OFF: never restrict empty points. Hint ON: keep all empty points active for blame probe.
      c.disabled =
        game.over ||
        game.busy ||
        game.turn !== "you" ||
        Boolean(side);
      const name = coordName(p);
      c.setAttribute(
        "aria-label",
        side ? `${name} ${side === "cpu" ? "CPU" : "YOU"}` : `${name} 空き`,
      );
    }

    if (game.over) {
      refs.turnLabel.textContent = "終局 — 置ける点がありません";
    } else if (game.busy) {
      refs.turnLabel.textContent = "必勝手を確認中…";
    } else {
      refs.turnLabel.textContent =
        game.turn === "you" ? "あなたの番です" : "CPUの番です";
    }

    refs.handLabel.textContent = `手数 ${game.handCount()}`;

    if (game.busy || refs.fetchLabel.dataset.active === "1") {
      refs.fetchLabel.hidden = false;
      refs.fetchLabel.textContent = "strategy取得中…";
    } else if (game.error) {
      refs.fetchLabel.hidden = false;
      refs.fetchLabel.textContent = `取得に失敗: ${game.error}`;
    } else {
      refs.fetchLabel.hidden = true;
    }
    refs.retryBtn.hidden = !game.error;

    refs.undoBtn.disabled = !game.canUndo();
    refs.redoBtn.disabled = !game.canRedo();
    refs.resetBtn.disabled = game.busy;

    const last = game.lastCpu;
    refs.dCanon.textContent =
      last?.canonHi === null || last?.canonHi === undefined
        ? "-"
        : `hi=${last.canonHi} lo=${last.canonLo?.toString(16)}`;
    refs.dShard.textContent =
      last?.shard === null || last?.shard === undefined
        ? "-"
        : last.shard.toString(16).padStart(2, "0");
    refs.dFetch.textContent = `${store.fetches} shards / ${store.bytesFetched} B`;

    paintCircles();
  }

  refs.undoBtn.addEventListener("click", () => {
    blame = null;
    game.undo();
  });
  refs.redoBtn.addEventListener("click", () => {
    blame = null;
    game.redo();
  });
  const doReset = () => {
    blame = null;
    endCircles = [];
    prevOver = false;
    game.reset();
  };
  refs.resetBtn.addEventListener("click", doReset);
  refs.retryBtn.addEventListener("click", () => {
    refs.fetchLabel.dataset.active = "0";
    game.error = null;
    render();
  });

  const onHintChange = () => {
    if (!hintOn()) blame = null;
    render();
  };
  const onResultChange = () => render();
  refs.hintToggle.addEventListener("change", onHintChange);
  refs.resultToggle.addEventListener("change", onResultChange);

  const syncSwitch = (input: HTMLInputElement) => {
    input.closest(".switch")?.classList.toggle("on", input.checked);
    input.setAttribute("aria-pressed", String(input.checked));
  };
  for (const input of [refs.hintToggle, refs.resultToggle, refs.soundToggle]) {
    syncSwitch(input);
    input.addEventListener("change", () => syncSwitch(input));
  }

  return {
    cells,
    setHint: (on: boolean) => {
      if (refs.hintToggle.checked !== on) {
        refs.hintToggle.checked = on;
        refs.hintToggle.dispatchEvent(new Event("change"));
      }
    },
    setResult: (on: boolean) => {
      if (refs.resultToggle.checked !== on) {
        refs.resultToggle.checked = on;
        refs.resultToggle.dispatchEvent(new Event("change"));
      }
    },
    setSound: (on: boolean) => {
      if (refs.soundToggle.checked !== on) {
        refs.soundToggle.checked = on;
        refs.soundToggle.dispatchEvent(new Event("change"));
      }
    },
    render,
  };
}
