/**
 * Controls Playground: збирає playground/main.tsx через esbuild і роздає локально.
 * Стилі беруться з того самого src/styles.css (і через нього — з generated tokens),
 * що й у застосунку; власної палітри Playground не має.
 *
 * `--build` лише збирає (для CI-перевірки, що Playground компілюється), без сервера.
 */
import * as esbuild from "esbuild";
import { join } from "node:path";

const packageRoot = join(import.meta.dirname, "..");
const playgroundRoot = join(packageRoot, "playground");
const port = Number(process.env["PORT"] ?? 4320);

const options: esbuild.BuildOptions = {
  // Лише чинний UI Kit: порівняння з архівними палітрами прибрано після погодження v1.2 (05.11.2026).
  entryPoints: {
    main: join(playgroundRoot, "main.tsx"),
  },
  outdir: join(playgroundRoot, "dist"),
  bundle: true,
  format: "esm",
  jsx: "automatic",
  sourcemap: true,
  target: "es2022",
  loader: { ".woff2": "file" },
  logLevel: "info",
  // Директива "use client" має сенс лише для React Server Components; у бандлі вона зайва.
  logOverride: { "module-level-directive": "silent" },
};

if (process.argv.includes("--build")) {
  await esbuild.build({ ...options, minify: true, logLevel: "warning" });
  console.log("PASS: Playground зібрано.");
} else {
  const context = await esbuild.context(options);
  await context.watch();
  const { port: actual } = await context.serve({ servedir: playgroundRoot, port });
  console.log(`IndeX Controls Playground: http://localhost:${actual}/`);
}
