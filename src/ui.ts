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
  dCanon: HTMLElement;
  dShard: HTMLElement;
  dStrategy: HTMLElement;
  dFetch: HTMLElement;
}

interface ResultCircle {
  circle: Circle;
  latest: boolean;
}

const MAX_RESULT_CIRCLES = 100;

function circleKey(c: Circle): string {
  return `${c.cx.toFixed(9)},${c.cy.toFixed(9)},${c.r.toFixed(9)}`;
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
  render: () => void;
} {
  const cells: HTMLButtonElement[] = [];

  const hintOn = () => refs.hintToggle.checked;
  const resultOn = () => refs.resultToggle.checked;

  for (let p = 0; p < POINT_COUNT; p++) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "cell";
    b.setAttribute("role", "gridcell");
    b.setAttribute("aria-label", `(${coordName(p)})`);
    b.dataset.point = String(p);
    b.addEventListener("click", () => {
      if (game.busy || game.stones.has(p)) return;
      if (game.over) {
        game.playAnalysis(p);
        return;
      }
      if (game.turn !== "you") return;
      void game.playYou(p);
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

  function collectResultCircles(): ResultCircle[] | null {
    const byCircle = new Map<string, ResultCircle>();
    for (const quad of engine.violatingQuads(game.state)) {
      const circle = circleFromQuad(quad);
      if (!circle) continue;
      const key = circleKey(circle);
      const latest = game.lastMove !== null && quad.includes(game.lastMove);
      const seen = byCircle.get(key);
      if (seen) {
        if (latest) seen.latest = true;
      } else {
        byCircle.set(key, { circle, latest });
        if (byCircle.size >= MAX_RESULT_CIRCLES) return null;
      }
    }
    return [...byCircle.values()];
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

    const circles = collectResultCircles();
    if (circles === null) return;
    for (const item of circles) draw(item.circle, !item.latest);
  }

  function render(): void {
    const legal = new Set(game.legalForYou());
    const showHints = hintOn();
    refs.board.classList.toggle("hint-on", showHints);

    for (let p = 0; p < POINT_COUNT; p++) {
      const c = cells[p]!;
      const side = game.stones.get(p);
      c.classList.toggle("cpu", side === "cpu");
      c.classList.toggle("you", side === "you");
      c.classList.toggle("last", game.lastMove === p);
      c.classList.toggle("hint-ok", showHints && legal.has(p));
      c.disabled =
        game.busy ||
        (!game.over && game.turn !== "you") ||
        Boolean(side);
      const name = coordName(p);
      c.setAttribute(
        "aria-label",
        side ? `${name} ${side === "cpu" ? "CPU" : "YOU"}` : `${name} 空き`,
      );
    }

    if (game.over) {
      const outcome =
        game.winner === "you" ? "あなたの勝ち" :
        game.winner === "cpu" ? "あなたの負け" :
        "終局";
      refs.turnLabel.textContent =
        game.handCount() === POINT_COUNT
          ? `${outcome} — 盤面が埋まりました`
          : `${outcome} — 自由に置いて確認できます`;
    } else if (game.busy) {
      refs.turnLabel.textContent = "必勝手を確認中…";
    } else if (game.turn === "you" && legal.size === 0) {
      refs.turnLabel.textContent = "あなたの番です — 安全な手がありません";
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

  refs.undoBtn.addEventListener("click", () => game.undo());
  refs.redoBtn.addEventListener("click", () => game.redo());
  refs.resetBtn.addEventListener("click", () => game.reset());
  refs.retryBtn.addEventListener("click", () => {
    refs.fetchLabel.dataset.active = "0";
    game.error = null;
    render();
  });

  const onHintChange = () => render();
  const onResultChange = () => render();
  refs.hintToggle.addEventListener("change", onHintChange);
  refs.resultToggle.addEventListener("change", onResultChange);

  const syncSwitch = (input: HTMLInputElement) => {
    input.closest(".switch")?.classList.toggle("on", input.checked);
    input.setAttribute("aria-pressed", String(input.checked));
  };
  for (const input of [refs.hintToggle, refs.resultToggle]) {
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
    render,
  };
}
