/**
 * Локальний сервер готової збірки (`pnpm build` → `pnpm start`): без залежностей, без інтернету.
 * Віддає `public/` на http://localhost:4340/. Для показу прототипу, а не для розробки (для неї — `pnpm dev`).
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const root = join(import.meta.dirname, "..", "public");
const port = Number(process.env["PORT"] ?? 4340);

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".data": "application/octet-stream",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
};

if (!existsSync(join(root, "dist", "main.js"))) {
  console.error("Збірки ще немає. Спершу виконайте: pnpm build");
  process.exit(1);
}

createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  // Шлях не може вийти за межі public/ (захист від ../).
  const requested = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
  const candidate = join(root, requested === "" ? "index.html" : requested);
  const safe = candidate.startsWith(root) && existsSync(candidate) && statSync(candidate).isFile();
  if (!safe) {
    // Навігація йде за хешем (#/...), тож будь-який інший шлях — це помилка, а не маршрут застосунку.
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Не знайдено");
    return;
  }
  response.writeHead(200, { "content-type": TYPES[extname(candidate)] ?? "application/octet-stream", "cache-control": "no-cache" });
  createReadStream(candidate).pipe(response);
})
  .on("error", (error: NodeJS.ErrnoException) => {
    if (error.code !== "EADDRINUSE") throw error;
    // Найчастіше порт тримає вже запущений `pnpm dev` або `pnpm start` в іншому вікні.
    console.error(
      `Порт ${port} уже зайнятий: імовірно, прототип уже запущено (pnpm dev або pnpm start в іншому вікні).\n` +
        `Відкрийте http://localhost:${port}/ або зупиніть той сервер (Ctrl+C). Інший порт: PORT=4341 pnpm start`,
    );
    process.exit(1);
  })
  .listen(port, "127.0.0.1", () => {
    console.log(`Прототип: http://localhost:${port}/  (Ctrl+C — зупинити)`);
  });
