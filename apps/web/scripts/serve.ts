/**
 * Збірка й локальний сервер web-застосунку через esbuild (як в IndeX).
 * Пакети @index/* розв'язуються через їхні package exports (dist і CSS).
 * `--build` — одноразова мінімізована збірка в public/dist.
 */
import * as esbuild from "esbuild";
import { join } from "node:path";

const appRoot = join(import.meta.dirname, "..");
const publicRoot = join(appRoot, "public");
const port = Number(process.env["PORT"] ?? 4340);

const options: esbuild.BuildOptions = {
  entryPoints: { main: join(appRoot, "src", "index.ts") },
  outdir: join(publicRoot, "dist"),
  bundle: true,
  format: "esm",
  jsx: "automatic",
  sourcemap: true,
  target: "es2022",
  loader: { ".woff2": "file" },
  logLevel: "info",
  logOverride: { "module-level-directive": "silent" },
};

if (process.argv.includes("--build")) {
  await esbuild.build({ ...options, minify: true, logLevel: "warning" });
  console.log("PASS: web зібрано.");
} else {
  const context = await esbuild.context(options);
  await context.watch();
  await context.serve({ servedir: publicRoot, host: "127.0.0.1", port });
  console.log(`dsp-orders web: http://localhost:${port}/`);
}
