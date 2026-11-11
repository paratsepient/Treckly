import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { extname, join, relative } from "node:path";

// Тести виконуються з dist/test-build/tests; корінь пакета — на три рівні вище.
const packageRoot = join(import.meta.dirname, "..", "..", "..");
const srcRoot = join(packageRoot, "src");

function listFiles(folder: string): string[] {
  return readdirSync(folder).flatMap((entry) => {
    const path = join(folder, entry);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

const files = listFiles(srcRoot);
const cssFiles = files.filter((file) => extname(file) === ".css");
const codeFiles = files.filter((file) => [".ts", ".tsx"].includes(extname(file)));
const read = (file: string): string => readFileSync(file, "utf8");
const strip = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, "");
const rel = (file: string): string => relative(packageRoot, file).replace(/\\/g, "/");

const tokensCss = read(fileURLToPath(import.meta.resolve("@index/design-tokens/tokens.css")));
const declared = new Set(Array.from(tokensCss.matchAll(/(--ix-[a-z0-9-]+):/g), (match) => match[1]!));

test("CSS: лише оголошені не-примітивні токени; власні змінні — тільки --ixp-", () => {
  const problems: string[] = [];
  for (const file of cssFiles) {
    const css = strip(read(file));
    for (const [, name] of css.matchAll(/var\((--ix-[a-z0-9-]+)/g)) {
      if (!declared.has(name!)) problems.push(`${rel(file)}: невідомий токен ${name}`);
      if (name!.startsWith("--ix-color-")) problems.push(`${rel(file)}: примітив ${name}`);
    }
    if (/(^|[;{\s])--ix-[a-z0-9-]+\s*:/.test(css)) problems.push(`${rel(file)}: оголошення в просторі --ix-`);
  }
  assert.deepEqual(problems, []);
});

test("Жодних літералів кольору", () => {
  const offenders = [...cssFiles, ...codeFiles].filter((file) => {
    const text = extname(file) === ".css" ? strip(read(file)) : read(file);
    return /#[0-9a-fA-F]{3,8}\b/.test(text) || /\b(rgba?|hsla?|oklch)\(/.test(text);
  });
  assert.deepEqual(offenders.map(rel), []);
});

test("Прокрутка лише через ScrollArea з @index/ui: жодного overflow auto/scroll у патернах", () => {
  for (const file of cssFiles) {
    const css = strip(read(file));
    assert.doesNotMatch(css, /overflow(-x|-y)?\s*:\s*(auto|scroll)/, rel(file));
    assert.doesNotMatch(css, /overscroll-behavior[^:]*:\s*(contain|none)/, rel(file));
  }
});

test("Повторне використання: патерни не реалізують власні tooltip, tabs, scroll чи кнопки", () => {
  const forbidden = [/role="tooltip"/, /role="tablist"/, /role="tab"/, /className="ix-/, /<button\b/];
  const problems: string[] = [];
  for (const file of codeFiles) {
    const text = read(file);
    for (const pattern of forbidden) {
      if (pattern.test(text)) problems.push(`${rel(file)}: ${pattern}`);
    }
  }
  assert.deepEqual(problems, []);
  // Контролі беруться з @index/ui.
  const imports = codeFiles.map(read).join("\n");
  for (const name of ["Button", "IconButton", "ScrollArea", "Tooltip", "Tabs", "Input"]) {
    assert.match(imports, new RegExp(`import \\{[^}]*\\b${name}\\b[^}]*\\} from "@index/ui"`), name);
  }
});

test("Імпорти: лише react, react-dom, публічні API @index/ui і @index/design-tokens", () => {
  const allowed = new Set(["react", "react-dom", "@index/ui", "@index/design-tokens"]);
  const problems: string[] = [];
  for (const file of codeFiles) {
    for (const [, specifier] of read(file).matchAll(/\bfrom\s+["']([^"']+)["']/g)) {
      if (!(specifier!.startsWith(".") || allowed.has(specifier!))) problems.push(`${rel(file)}: ${specifier}`);
    }
  }
  for (const file of cssFiles) {
    for (const [, specifier] of strip(read(file)).matchAll(/@import\s+["']([^"']+)["']/g)) {
      if (!(specifier!.startsWith("./") || specifier === "@index/ui/styles.css")) problems.push(`${rel(file)}: ${specifier}`);
    }
  }
  assert.deepEqual(problems, []);
});

test("Компоненти з хуками позначені \"use client\"", () => {
  for (const file of codeFiles.filter((item) => extname(item) === ".tsx")) {
    assert.ok(read(file).startsWith('"use client";'), rel(file));
  }
});

test("Публічний API: по одному компоненту кожного виду каркаса", async () => {
  const api = await import("../src/index.ts");
  assert.deepEqual(Object.keys(api).sort(), [
    "AppShell",
    "AppSidebar",
    "ContextPanel",
    "Dialog",
    "Drawer",
    // ЛОКАЛЬНА ЗМІНА (dsp-orders, див. UPSTREAM.md): шар повідомлень відкрито для власної оболонки застосунку.
    "FeedbackLayer",
    "FeedbackProvider",
    "FormFieldTable",
    "InspectorPanel",
    "MAX_VISIBLE_FEEDBACK",
    "SaveStatus",
    "ToolbarGroup",
    "ToolbarSeparator",
    "TreeView",
    "WorkspaceHeader",
    "WorkspaceLayout",
    "WorkspaceSurface",
    "WorkspaceToolbar",
    "useAppShell",
    "useFeedback",
    "useInspector",
    "useWorkspacePanels",
    "useWorkspaceSurfaceSize",
  ]);
});

test("Немає паралельних каркасів: ContextPanel і InspectorPanel будуються на одному PanelFrame", () => {
  const context = read(join(srcRoot, "panels", "ContextPanel.tsx"));
  const inspector = read(join(srcRoot, "panels", "InspectorPanel.tsx"));
  assert.match(context, /<PanelFrame/);
  assert.match(inspector, /<PanelFrame/);
  const drawers = codeFiles.filter((file) => /<dialog\b/.test(read(file)));
  assert.deepEqual(drawers.map(rel), ["src/internal/ModalDialog.tsx"], "модальний шар реалізовано один раз");
});

test("styles.css підключає кожен CSS-файл пакета", () => {
  const entry = read(join(srcRoot, "styles.css"));
  for (const file of cssFiles.filter((item) => !item.endsWith("styles.css"))) {
    const path = `./${relative(srcRoot, file).replace(/\\/g, "/")}`;
    assert.ok(entry.includes(`@import "${path}";`), path);
  }
});

test("Тіні лише з реєстру elevation: без застарілих --ix-shadow-raised/overlay", () => {
  const css = cssFiles.map((file) => readFileSync(file, "utf8")).join("\n");
  assert.doesNotMatch(css, /--ix-shadow-(raised|overlay)/);
  for (const [, value] of css.matchAll(/box-shadow:\s*([^;]+);/g)) {
    // Кожна частина — токен elevation або inset-індикатор на кольоровому токені.
    for (const part of value!.split(",")) {
      assert.match(part.trim(), /^(none|var\(--ix-shadow-(control|control-nested|control-pressed|socket|groove|inset|card|floating|floating-nested|floating-lifted|tab|modal)\)|var\(--ix-focus-(steady-)?shadow(-inset)?\)|var\(--focus-pulse-shadow\)|var\(--ix-well-error-ring\)|calc\(var\(--ix-radius-container\) \/ 2\) calc\(var\(--ix-radius-container\) \/ -?2\) 0 calc\(var\(--ix-radius-container\) \/ 2\) var\(--ix-surface\)|inset [^,]*var\(--ix-[a-z-]+\))$/, `box-shadow: ${value}`);
    }
  }
});


test("Візуальні ефекти лише з токенів: градієнти, радіуси, без важких фільтрів", () => {
  const problems: string[] = [];
  for (const file of cssFiles) {
    const css = strip(readFileSync(file, "utf8"));
    for (const [, value] of css.matchAll(/background-image:\s*([^;]+);/g)) {
      if (!/^(none|var\(--ix-tonal-(raised|pressed|tab)\))$/.test(value!.trim())) problems.push(`${rel(file)}: background-image ${value}`);
    }
    if (/\b(linear|radial|conic)-gradient\(/.test(css)) problems.push(`${rel(file)}: власний градієнт поза токенами`);
    if (/(^|[;{\s])(backdrop-)?filter\s*:/.test(css)) problems.push(`${rel(file)}: filter/backdrop-filter`);
    for (const [, value] of css.matchAll(/border-radius:\s*([^;]+);/g)) {
      if (!/^(var\(--ix-radius-[a-z]+\)\s*)+(0\s*)*$/.test(value!.trim().replace(/\s+0/g, " 0"))) problems.push(`${rel(file)}: border-radius ${value}`);
    }
    if (/transition:[^;]*\b(width|height|top|left|margin|padding)\b/.test(css)) problems.push(`${rel(file)}: анімація layout-властивості`);
  }
  assert.deepEqual(problems, []);
});
