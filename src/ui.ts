import { POINT_COUNT } from "./core";
import type { Engine } from "./engine";
import { GameController } from "./controller";
import { pointToXY } from "./core";

export interface UIRefs {
  board: HTMLElement;
  turnLabel: HTMLElement;
  fetchLabel: HTMLElement;
  undoBtn: HTMLButtonElement;
  redoBtn: HTMLButtonElement;
  resetBtn: HTMLButtonElement;
  retryBtn: HTMLButtonElement;
  hintToggle: HTMLButtonElement;
  resultToggle: HTMLButtonElement;
  soundToggle: HTMLButtonElement;
  resultPanel: HTMLElement;
  resultMain: HTMLElement;
  dCanon: HTMLElement;
  dShard: HTMLElement;
  dStrategy: HTMLElement;
  dFetch: HTMLElement;
  endOverlay: HTMLElement;
  endTitle: HTMLElement;
  endText: HTMLElement;
  againBtn: HTMLButtonElement;
}

function beep(win: boolean): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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

export function createUI(refs: UIRefs, game: GameController, engine: Engine, store: { fetches: number; bytesFetched: number }): {
  cells: HTMLButtonElement[];
  setHint: (on: boolean) => void;
  setResult: (on: boolean) => void;
  setSound: (on: boolean) => void;
  render: () => void;
} {
  let hint = false;
  let resultOn = true;
  let sound = false;
  const cells: HTMLButtonElement[] = [];
  let blame: number[] | null = null;

  for (let p = 0; p < POINT_COUNT; p++) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "cell";
    const { x, y } = pointToXY(p);
    b.setAttribute("role", "gridcell");
    b.setAttribute("aria-label", `(${x},${y})`);
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
    refs.board.appendChild(b);
    cells.push(b);
  }

  function render(): void {
    const legal = new Set(game.legalForYou());
    for (let p = 0; p < POINT_COUNT; p++) {
      const c = cells[p]!;
      const side = game.stones.get(p);
      c.classList.toggle("cpu", side === "cpu");
      c.classList.toggle("you", side === "you");
      c.classList.toggle("last", game.lastMove === p);
      c.classList.toggle("hint-ok", hint && legal.has(p));
      c.classList.toggle("blame", blame !== null && blame.includes(p));
      c.disabled = game.over || game.busy || game.turn !== "you" || (!legal.has(p) && !game.stones.has(p) && !hint);
      const { x, y } = pointToXY(p);
      c.setAttribute("aria-label", side ? `(${x},${y}) ${side === "cpu" ? "CPU" : "YOU"}` : `(${x},${y}) 空き`);
    }

    if (game.over) {
      refs.turnLabel.textContent =
        game.winner === "cpu" ? "終局 — CPUの勝ちです" : "終局 — あなたの勝ちです";
    } else if (game.busy) {
      refs.turnLabel.textContent = "必勝手を確認中…";
    } else {
      refs.turnLabel.textContent =
        game.turn === "you" ? "あなたの番です" : "CPUの番です";
    }

    if (game.busy || refs.fetchLabel.dataset.active === "1") {
      refs.fetchLabel.hidden = false;
      refs.fetchLabel.textContent = "strategy取得中…";
    } else if (game.error) {
      refs.fetchLabel.hidden = false;
      refs.fetchLabel.textContent = `取得に失敗しました: ${game.error}`;
    } else {
      refs.fetchLabel.hidden = true;
    }
    refs.retryBtn.hidden = !game.error;

    refs.undoBtn.disabled = !game.canUndo();
    refs.redoBtn.disabled = !game.canRedo();
    refs.resetBtn.disabled = game.busy;

    refs.resultPanel.hidden = !resultOn;
    const n = game.handCount();
    refs.resultMain.textContent = game.over
      ? `手数 ${n} ／ ${game.winner === "cpu" ? "CPUの勝ち" : "あなたの勝ち"}`
      : `手数 ${n} ／ ${game.turn === "you" ? "あなたの番です" : "CPUの番です"}`;
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

    if (game.over) {
      refs.endOverlay.hidden = false;
      refs.endTitle.textContent = game.winner === "cpu" ? "CPUの勝ち" : "あなたの勝ち";
      refs.endText.textContent =
        game.winner === "cpu"
          ? `手数 ${n} で終局。証明済み必勝戦略どおりの勝ち筋でした。`
          : `手数 ${n} で終局。あなたの勝ちです。`;
      if (sound) beep(game.winner === "you");
    } else {
      refs.endOverlay.hidden = true;
    }
  }

  refs.undoBtn.addEventListener("click", () => game.undo());
  refs.redoBtn.addEventListener("click", () => game.redo());
  const doReset = () => {
    blame = null;
    game.reset();
  };
  refs.resetBtn.addEventListener("click", doReset);
  refs.againBtn.addEventListener("click", doReset);
  refs.retryBtn.addEventListener("click", () => {
    refs.fetchLabel.dataset.active = "0";
    game.error = null;
    render();
  });
  refs.hintToggle.addEventListener("click", () => {
    hint = !hint;
    refs.hintToggle.textContent = hint ? "Hint ON" : "Hint OFF";
    refs.hintToggle.setAttribute("aria-pressed", String(hint));
    if (!hint) blame = null;
    render();
  });
  refs.resultToggle.addEventListener("click", () => {
    resultOn = !resultOn;
    refs.resultToggle.textContent = resultOn ? "Result ON" : "Result OFF";
    refs.resultToggle.setAttribute("aria-pressed", String(resultOn));
    render();
  });
  refs.soundToggle.addEventListener("click", () => {
    sound = !sound;
    refs.soundToggle.textContent = sound ? "音 ON" : "音 OFF";
    refs.soundToggle.setAttribute("aria-pressed", String(sound));
  });

  return {
    cells,
    setHint: (on: boolean) => {
      if ((on && !hint) || (!on && hint)) refs.hintToggle.click();
    },
    setResult: (on: boolean) => {
      if ((on && !resultOn) || (!on && resultOn)) refs.resultToggle.click();
    },
    setSound: (on: boolean) => {
      if ((on && !sound) || (!on && sound)) refs.soundToggle.click();
    },
    render,
  };
}
