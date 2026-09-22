import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const di = process.argv.indexOf("--dir");
const dir = di >= 0 ? process.argv[di + 1] : ".strategy";
const pi = process.argv.indexOf("--port");
const port = Number(pi >= 0 ? process.argv[pi + 1] : 8099);

createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://x");
    const name = url.pathname.replace(/^\//, "");
    if (!/^(manifest\.json|[0-9a-f]{2}\.bin)$/.test(name)) {
      res.writeHead(404);
      res.end("no");
      return;
    }
    const path = `${dir}/${name}`;
    if (!existsSync(path)) {
      res.writeHead(404);
      res.end("missing");
      return;
    }
    const data = await readFile(path);
    res.writeHead(200, {
      "Content-Type": name.endsWith(".json") ? "application/json" : "application/octet-stream",
      "Content-Length": data.length,
      "Cache-Control": "public, max-age=86400",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(data);
  } catch {
    res.writeHead(500);
    res.end("err");
  }
}).listen(port, "127.0.0.1", () => console.log(`strategy server: ${dir} on :${port}`));
