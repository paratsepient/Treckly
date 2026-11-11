/**
 * Збірка й локальний сервер web-застосунку через esbuild (як в IndeX).
 * Пакети @index/* розв'язуються через їхні package exports (dist і CSS).
 * `--build` — одноразова мінімізована збірка в public/dist.
 *
 * PGlite завантажує pglite.wasm, pglite.data і initdb.wasm відносно власного
 * бандла (new URL(..., import.meta.url)), тому ці файли копіюються в dist поруч
 * з main.js: усе локально, без CDN.
 */
import * as esbuild from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = join(import.meta.dirname, "..");
const publicRoot = join(appRoot, "public");
const outdir = join(publicRoot, "dist");
const port = Number(process.env["PORT"] ?? 4340);

function copyPgliteAssets(): void {
  const pgliteDist = dirname(fileURLToPath(import.meta.resolve("@electric-sql/pglite")));
  mkdirSync(outdir, { recursive: true });
  for (const file of ["pglite.wasm", "pglite.data", "initdb.wasm"]) {
    copyFileSync(join(pgliteDist, file), join(outdir, file));
  }
}

const options: esbuild.BuildOptions = {
  entryPoints: {
    main: join(appRoot, "src", "index.ts"),
    // Етап 0: перевірка Hono + PGlite у браузері (spike.html).
    spike: join(appRoot, "src", "spike", "index.ts"),
  },
  outdir,
  bundle: true,
  format: "esm",
  jsx: "automatic",
  sourcemap: true,
  target: "es2022",
  loader: { ".woff2": "file" },
  logLevel: "info",
  logOverride: { "module-level-directive": "silent" },
};

copyPgliteAssets();

if (process.argv.includes("--build")) {
  await esbuild.build({ ...options, minify: true, logLevel: "warning" });
  console.log("PASS: web зібрано.");
} else {
  const context = await esbuild.context(options);
  await context.watch();
  await context.serve({ servedir: publicRoot, host: "127.0.0.1", port });
  console.log(`dsp-orders web: http://localhost:${port}/`);
}
