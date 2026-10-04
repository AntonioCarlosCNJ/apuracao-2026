const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT) || 4173;
const PUBLIC_DIR = path.join(__dirname, "public");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};

function enviarJson(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function servirArquivo(res, urlPath) {
  let rel = urlPath === "/" ? "index.html" : decodeURIComponent(urlPath);
  rel = rel.replace(/^[/\\]+/, "");
  const file = path.resolve(PUBLIC_DIR, rel);
  const root = path.resolve(PUBLIC_DIR);
  if (file !== root && !file.startsWith(root + path.sep)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "content-type": TYPES[path.extname(file)] || "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(data);
  });
}

async function main() {
  const { atualizar } = await import("./lib/apuracao.mjs");
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    if (url.pathname === "/api/apuracao") {
      try {
        const pacote = await atualizar();
        enviarJson(res, 200, { ...pacote, idadeMs: Date.now() - pacote.obtidoMs });
      } catch (error) {
        enviarJson(res, 502, { erro: error.message });
      }
      return;
    }
    servirArquivo(res, url.pathname);
  });

  server.listen(PORT, "127.0.0.1", () => {
    console.log(`Apuração ao vivo: http://127.0.0.1:${PORT}`);
    atualizar().catch((error) => console.error(error.message));
  });
}

main();
