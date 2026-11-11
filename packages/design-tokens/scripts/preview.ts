/**
 * Мінімальний локальний сервер preview без залежностей.
 * Віддає лише preview/, generated/ і fonts/, щоб сторінка не могла випадково
 * підхопити щось поза пакетом.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";

const packageRoot = join(import.meta.dirname, "..");
const port = Number(process.env["PORT"] ?? 4310);
const allowedRoots = ["preview", "generated", "fonts"].map((folder) => join(packageRoot, folder) + sep);

const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".woff2": "font/woff2",
};

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  const relativePath = pathname === "/" ? "preview/index.html" : decodeURIComponent(pathname.slice(1));
  const file = normalize(join(packageRoot, relativePath));

  if (!allowedRoots.some((root) => file.startsWith(root))) {
    response.writeHead(404).end("Not found");
    return;
  }

  try {
    const body = await readFile(file);
    response
      .writeHead(200, {
        "content-type": contentTypes[extname(file)] ?? "application/octet-stream",
        // Після перегенерації токенів сторінка має одразу показати нові значення.
        "cache-control": "no-store",
      })
      .end(body);
  } catch {
    response.writeHead(404).end("Not found");
  }
});

server.listen(port, () => {
  console.log(`IndeX Foundations preview: http://localhost:${port}/`);
});
