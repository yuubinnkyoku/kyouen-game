// Starts both the strategy file server (:8099) and vite dev (:5173) in one
// process so Playwright's webServer only needs a single command/port.
const { spawn } = require("node:child_process");

const strat = spawn(
  process.execPath,
  ["tools/serve-strategy.mjs", "--dir", ".strategy", "--port", "8099"],
  { stdio: "inherit" },
);
const vite = spawn(
  process.execPath,
  ["./node_modules/vite/bin/vite.js", "--port", "5173", "--strictPort", "--host", "127.0.0.1"],
  { stdio: "inherit" },
);

const kill = () => {
  try { strat.kill(); } catch { /* noop */ }
  try { vite.kill(); } catch { /* noop */ }
};
process.on("exit", kill);
process.on("SIGINT", () => { kill(); process.exit(0); });
process.on("SIGTERM", () => { kill(); process.exit(0); });
