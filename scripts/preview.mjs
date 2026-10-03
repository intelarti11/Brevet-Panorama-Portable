import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";

const root = resolve("out");
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".txt": "text/plain", ".ttf": "font/ttf", ".svg": "image/svg+xml" };
createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");
    let path = resolve(root, `.${decodeURIComponent(url.pathname)}`);
    if (path !== root && !path.startsWith(`${root}${sep}`)) throw new Error("Invalid path");
    if (!extname(path)) path = resolve(path, "index.html");
    const body = await readFile(path);
    response.writeHead(200, { "Content-Type": types[extname(path)] ?? "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404); response.end("Not found");
  }
}).listen(9005, "127.0.0.1", () => console.log("Apercu statique sur http://127.0.0.1:9005 (backend natif requis pour les donnees)."));
