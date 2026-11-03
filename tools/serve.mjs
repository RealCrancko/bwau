// Kleiner lokaler Server zum Testen: node tools/serve.mjs [port]
import http from "http"; import fs from "fs"; import path from "path";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "..");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json", ".json": "application/json" };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]); if (p.endsWith("/")) p += "index.html";
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end("nicht gefunden") }
  res.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream", "cache-control": "no-store" });
  fs.createReadStream(f).pipe(res);
}).listen(+process.argv[2] || 5173, () => console.log("BWAU läuft auf http://localhost:" + (+process.argv[2] || 5173)));
