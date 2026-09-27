import { BoardBits, CENTER_ID, POINT_COUNT, hasPoint, withPoint } from "./core";
import type { Engine } from "./engine";
import { cpuMove, type CpuMove, type StrategyStore } from "./game";

export type Side = "cpu" | "you";

export interface HistoryEntry {
  you: number;
  cpu: number | null;
  loser: Side | null;
}

export class GameController {
  state: BoardBits = { lo: 0n, hi: 0n };
  stones = new Map<number, Side>();
  moveOrder: { point: number; side: Side }[] = [];
  history: HistoryEntry[] = [];
  undone: HistoryEntry[] = [];
  analysisMoves: number[] = [];
  analysisUndone: number[] = [];
  lastMove: number | null = null;
  turn: Side = "cpu";
  over = false;
  winner: Side | null = null;
  busy = false;
  error: string | null = null;
  lastCpu: CpuMove | null = null;

  constructor(
    private engine: Engine,
    private store: StrategyStore,
    private hooks: {
      onChange: () => void;
      onNeedRetry: (message: string) => void;
    },
  ) {}

  private emit(): void {
    this.hooks.onChange();
  }

  reset(): void {
    this.state = { lo: 0n, hi: 0n };
    this.stones.clear();
    this.moveOrder = [];
    this.history = [];
    this.undone = [];
    this.analysisMoves = [];
    this.analysisUndone = [];
    this.lastMove = null;
    this.over = false;
    this.winner = null;
    this.busy = false;
    this.error = null;
    this.lastCpu = null;
    this.place(CENTER_ID, "cpu");
    this.turn = "you";
    this.emit();
  }

  private place(p: number, side: Side): void {
    this.state = withPoint(this.state, p);
    this.stones.set(p, side);
    this.moveOrder.push({ point: p, side });
    this.lastMove = p;
  }

  private unplace(p: number): void {
    this.stones.delete(p);
    this.moveOrder.pop();
    if (p < 64) this.state = { lo: this.state.lo & ~(1n << BigInt(p)), hi: this.state.hi };
    else this.state = { lo: this.state.lo, hi: this.state.hi & ~(1n << BigInt(p - 64)) };
    this.lastMove = this.moveOrder.length ? this.moveOrder[this.moveOrder.length - 1]!.point : null;
  }

  private firstEmptyPoint(): number | null {
    for (let p = 0; p < POINT_COUNT; p++) if (!hasPoint(this.state, p)) return p;
    return null;
  }

  legalForYou(): number[] {
    if (this.over || this.busy || this.turn !== "you") return [];
    return this.engine.legalMoves(this.state);
  }

  playAnalysis(p: number): void {
    if (!this.over || this.busy) return;
    if (p < 0 || p >= POINT_COUNT || hasPoint(this.state, p)) return;
    this.place(p, "you");
    this.analysisMoves.push(p);
    this.analysisUndone = [];
    this.emit();
  }

  async playYou(p: number): Promise<void> {
    if (this.over || this.busy || this.turn !== "you") return;
    if (p < 0 || p >= POINT_COUNT || hasPoint(this.state, p)) return;

    const youLose = !this.engine.isLegal(this.state, p);
    this.error = null;
    this.busy = true;
    this.emit();
    this.place(p, "you");

    if (youLose) {
      this.history.push({ you: p, cpu: null, loser: "you" });
      this.undone = [];
      this.analysisUndone = [];
      this.busy = false;
      this.turn = "you";
      this.over = true;
      this.winner = "cpu";
      this.emit();
      return;
    }

    this.turn = "cpu";
    this.emit();
    await new Promise((r) => setTimeout(r, 120));

    const cpuSafeMoves = this.engine.legalMoves(this.state);
    if (cpuSafeMoves.length === 0) {
      const losingPoint = this.firstEmptyPoint();
      if (losingPoint === null) {
        this.history.push({ you: p, cpu: null, loser: "cpu" });
      } else {
        this.place(losingPoint, "cpu");
        this.history.push({ you: p, cpu: losingPoint, loser: "cpu" });
      }
      this.undone = [];
      this.analysisUndone = [];
      this.busy = false;
      this.turn = "you";
      this.over = true;
      this.winner = "you";
      this.emit();
      return;
    }

    let cpuPoint: number | null = null;
    try {
      const mv = await cpuMove(this.state, this.store, this.engine);
      this.lastCpu = mv;
      cpuPoint = mv.point;
      this.place(mv.point, "cpu");
    } catch (e) {
      this.unplace(p);
      this.turn = "you";
      this.busy = false;
      this.error = e instanceof Error ? e.message : String(e);
      this.hooks.onNeedRetry(this.error);
      this.emit();
      return;
    }

    this.history.push({ you: p, cpu: cpuPoint, loser: null });
    this.undone = [];
    this.analysisUndone = [];
    this.busy = false;
    this.turn = "you";
    this.emit();
  }

  undo(): void {
    if (this.busy) return;

    if (this.over && this.analysisMoves.length > 0) {
      const p = this.analysisMoves.pop()!;
      this.unplace(p);
      this.analysisUndone.push(p);
      this.emit();
      return;
    }

    if (this.history.length === 0) return;
    const entry = this.history.pop()!;
    if (entry.cpu !== null) this.unplace(entry.cpu);
    this.unplace(entry.you);
    this.undone.push(entry);
    this.over = false;
    this.winner = null;
    this.error = null;
    this.turn = "you";
    this.emit();
  }

  redo(): void {
    if (this.busy) return;

    if (this.over && this.analysisUndone.length > 0) {
      const p = this.analysisUndone.pop()!;
      this.place(p, "you");
      this.analysisMoves.push(p);
      this.emit();
      return;
    }

    if (this.undone.length === 0) return;
    const entry = this.undone.pop()!;
    this.place(entry.you, "you");
    if (entry.cpu !== null) this.place(entry.cpu, "cpu");
    this.history.push(entry);
    this.turn = "you";
    this.over = entry.loser !== null;
    this.winner =
      entry.loser === "you" ? "cpu" :
      entry.loser === "cpu" ? "you" :
      null;
    this.emit();
  }

  canUndo(): boolean {
    return !this.busy && (this.analysisMoves.length > 0 || this.history.length > 0);
  }

  canRedo(): boolean {
    return !this.busy &&
      ((this.over && this.analysisUndone.length > 0) || this.undone.length > 0);
  }

  handCount(): number {
    return this.moveOrder.length;
  }
}
