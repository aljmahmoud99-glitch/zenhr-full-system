const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const root = process.env.STATIC_ROOT || path.resolve(__dirname, "../frontend/dist/zenjo-ng/browser");
const backend = new URL(process.env.BACKEND_URL || "http://localhost:3007");
const port = Number(process.env.PORT || 5001);

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function proxy(req, res) {
  const target = new URL(req.url, backend);
  const out = http.request(target, {
    method: req.method,
    headers: { ...req.headers, host: backend.host },
  }, upstream => {
    res.writeHead(upstream.statusCode || 502, upstream.headers);
    upstream.pipe(res);
  });
  out.on("error", err => {
    res.writeHead(502, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ success: false, message: err.message }));
  });
  req.pipe(out);
}

function serve(req, res) {
  const clean = decodeURIComponent((req.url || "/").split("?")[0]);
  const rel = clean === "/" ? "/index.html" : clean;
  const candidate = path.resolve(root, "." + rel);
  const file = candidate.startsWith(root) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()
    ? candidate
    : path.join(root, "index.html");
  res.writeHead(200, { "content-type": mime[path.extname(file).toLowerCase()] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}

http.createServer((req, res) => {
  if ((req.url || "").startsWith("/api/") || (req.url || "").startsWith("/uploads/")) return proxy(req, res);
  return serve(req, res);
}).listen(port, "127.0.0.1", () => {
  console.log(`static proxy listening on http://127.0.0.1:${port}, root=${root}, backend=${backend.href}`);
});
