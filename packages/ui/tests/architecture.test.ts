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

const sourceFiles = listFiles(srcRoot);
const cssFiles = sourceFiles.filter((file) => extname(file) === ".css");
const codeFiles = sourceFiles.filter((file) => [".ts", ".tsx"].includes(extname(file)));
const stripCssComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, "");
const read = (file: string): string => readFileSync(file, "utf8");
const rel = (file: string): string => relative(packageRoot, file).replace(/\\/g, "/");

// Токени читаємо через публічний export — це заодно перевіряє, що export працює.
const tokensCss = read(fileURLToPath(import.meta.resolve("@index/design-tokens/tokens.css")));
const declaredTokens = new Set(Array.from(tokensCss.matchAll(/(--ix-[a-z0-9-]+):/g), (match) => match[1]!));

test("Токени доступні через @index/design-tokens/tokens.css", () => {
  assert.ok(declaredTokens.has("--ix-surface"));
  assert.ok(declaredTokens.size > 50);
});

test("CSS компонентів використовує лише оголошені не-примітивні токени", () => {
  const problems: string[] = [];
  for (const file of cssFiles) {
    const css = stripCssComments(read(file));
    for (const [, name] of css.matchAll(/var\((--ix-[a-z0-9-]+)/g)) {
      if (!declaredTokens.has(name!)) problems.push(`${rel(file)}: невідомий токен ${name}`);
      if (name!.startsWith("--ix-color-")) problems.push(`${rel(file)}: примітив ${name} замість семантичного токена`);
    }
    if (/(^|[;{\s])--ix-[a-z0-9-]+\s*:/.test(css)) {
      problems.push(`${rel(file)}: компонент не може оголошувати змінні в просторі --ix- (він належить токенам)`);
    }
  }
  assert.deepEqual(problems, []);
});

test("Жодних літералів кольору в src (HEX, rgb, hsl, oklch, іменовані)", () => {
  const named = /:\s*[^;]*\b(white|black|gray|grey|red|green|blue|orange|olive|yellow)\b/;
  const problems: string[] = [];
  for (const file of [...cssFiles, ...codeFiles]) {
    const text = extname(file) === ".css" ? stripCssComments(read(file)) : read(file);
    if (/#[0-9a-fA-F]{3,8}\b/.test(text)) problems.push(`${rel(file)}: HEX`);
    if (/\b(rgba?|hsla?|oklch|oklab|lab|lch)\(/.test(text)) problems.push(`${rel(file)}: функція кольору`);
    if (extname(file) === ".css" && named.test(text)) problems.push(`${rel(file)}: іменований колір`);
  }
  assert.deepEqual(problems, []);
});

/** Розбирає CSS на пари «селектор → оголошення» (вкладені @media теж). */
function rules(css: string): Array<{ selector: string; body: string }> {
  return Array.from(stripCssComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g), (match) => ({
    selector: match[1]!.trim(),
    body: match[2]!,
  }));
}

test("--ix-border лише для роздільників і контурів контейнерів, не для меж контролів", () => {
  // Плаваючі контейнери (підказка, відкритий список Select, popover) мають тонкий контур;
  // лінії сітки діаграми й таблиці, розділювач меню — роздільники (волосяні, рецесивні);
  // картка й нода графа — контури контейнерів рівня card.
  const allowed = new Set([
    ".ix-tabs__list",
    ".ix-tooltip",
    ".ix-select__control::picker(select)",
    ".ix-bar__grid",
    ".ix-card",
    ".ix-table__header",
    ".ix-table__cell",
    ".ix-popover",
    ".ix-menu__separator",
    ".ix-graph-node",
    ".ix-graph-node__ports",
  ]);
  const offenders = cssFiles.flatMap((file) =>
    rules(read(file))
      .filter((rule) => /var\(--ix-border\)/.test(rule.body) && !allowed.has(rule.selector))
      .map((rule) => `${rel(file)}: ${rule.selector}`),
  );
  assert.deepEqual(offenders, []);
});

test("Межі заглиблених контролів — токен лунки (--ix-well-border) і форма --ix-shadow-inset", () => {
  const all = cssFiles.flatMap((file) => rules(read(file)));
  for (const selector of [".ix-input", ".ix-checkbox__box,\n.ix-radio__circle", ".ix-switch__track"]) {
    const rule = all.find((item) => item.selector === selector);
    assert.ok(rule, `немає правила ${selector}`);
    // До v1.2 токен дорівнює border-strong (≥ 3:1), у v1.2 межу дає тінь лунки.
    assert.match(rule.body, /border:\s*var\(--ix-control-border-width\) solid var\(--ix-well-border\)/, selector);
    // Без рамки межа в forced-colors тримається на прозорому outline.
    assert.match(rule.body, /outline:\s*1px solid transparent/, selector);
    assert.match(rule.body, /box-shadow:\s*var\(--ix-shadow-inset\)/, selector);
  }
});

test("Кожен фокусований контрол має focus-visible зі світінням із токенів", () => {
  const css = cssFiles.map((file) => stripCssComments(read(file))).join("\n");
  for (const selector of [".ix-button:focus-visible", ".ix-input:focus-visible", ".ix-choice__input:focus-visible", ".ix-tabs__tab:focus-visible", ".ix-scroll-area__viewport:focus-visible", ".ix-tabs__panel:focus-visible"]) {
    const rule = rules(css).find((item) => item.selector.split(",").map((part) => part.trim()).some((part) => part.startsWith(selector)));
    assert.ok(rule, selector);
    // Світіння з токенів (на хостах пульсації — постійна steady-частина) + прозорий
    // outline для режиму високої контрастності.
    assert.match(rule.body, /box-shadow:\s*var\(--ix-focus-(steady-)?shadow(-inset)?\)/, selector);
    assert.match(rule.body, /outline:\s*var\(--ix-focus-width\) solid transparent/, selector);
  }
});

test("Прокрутка без пасток: overscroll-behavior не обмежується", () => {
  for (const file of cssFiles) {
    const css = stripCssComments(read(file));
    assert.doesNotMatch(css, /overscroll-behavior[^:]*:\s*(contain|none)/, rel(file));
  }
});

test("Анімації вимикаються при prefers-reduced-motion", () => {
  const css = cssFiles.map((file) => stripCssComments(read(file))).join("\n");
  if (/animation:\s*ix-/.test(css)) {
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation:\s*none/);
  }
  // Переходи використовують токени тривалості, які tokens.css обнуляє при reduced motion.
  for (const [, value] of css.matchAll(/transition:([^;]+);/g)) {
    assert.doesNotMatch(value!, /\d+m?s/, `перехід з літеральною тривалістю: ${value}`);
  }
});

test("Імпорти: лише react, react-dom, відносні шляхи та публічні exports @index/design-tokens", () => {
  const problems: string[] = [];
  for (const file of codeFiles) {
    for (const [, specifier] of read(file).matchAll(/\bfrom\s+["']([^"']+)["']|\bimport\s+["']([^"']+)["']/g)) {
      if (specifier === undefined) continue;
      if (!(specifier.startsWith(".") || specifier === "react" || specifier === "react-dom")) problems.push(`${rel(file)}: ${specifier}`);
    }
  }
  for (const file of cssFiles) {
    for (const [, specifier] of stripCssComments(read(file)).matchAll(/@import\s+["']([^"']+)["']/g)) {
      if (!(specifier!.startsWith("./") || specifier === "@index/design-tokens/tokens.css")) problems.push(`${rel(file)}: ${specifier}`);
    }
  }
  assert.deepEqual(problems, []);
});

test("Публічні компоненти позначені \"use client\"", () => {
  const components = codeFiles.filter((file) => extname(file) === ".tsx" && !rel(file).startsWith("src/internal/"));
  for (const file of components) {
    assert.ok(read(file).startsWith('"use client";'), rel(file));
  }
});

test("Публічний API: один канонічний компонент кожного виду", async () => {
  const api = await import("../src/index.ts");
  assert.deepEqual(Object.keys(api).sort(), [
    "Badge",
    "BarChart",
    "Button",
    "Card",
    "Checkbox",
    "DataState",
    "DataTable",
    "DonutChart",
    "Emblem",
    "FocusPulse",
    "GraphCanvas",
    "GraphFrame",
    "GraphNode",
    "Icon",
    "IconButton",
    "Input",
    "KpiTile",
    "Menu",
    "PieChart",
    "Popover",
    "Radio",
    "RadioGroup",
    "ScrollArea",
    "SegmentedControl",
    "Select",
    "Switch",
    "Tab",
    "TabList",
    "TabPanel",
    "Tabs",
    "Textarea",
    "Tooltip",
    "graphGridStep",
    "graphZoomLimits",
    "graphZoomStep",
    "iconNames",
  ]);
});

test("styles.css підключає кожен CSS-файл компонентів", () => {
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
      assert.match(part.trim(), /^(none|var\(--ix-shadow-(control|control-nested|control-pressed|socket|inset|card|floating|floating-nested|floating-lifted|modal)\)|var\(--ix-focus-(steady-)?shadow(-inset)?\)|var\(--focus-pulse-shadow\)|var\(--ix-well-error-ring\)|calc\(var\(--ix-radius-container\) \/ -?2\) calc\(var\(--ix-radius-container\) \/ 2\) 0 calc\(var\(--ix-radius-container\) \/ 2\) var\(--ix-surface-raised\)|inset [^,]*var\(--ix-[a-z-]+\))$/, `box-shadow: ${value}`);
    }
  }
});


test("Візуальні ефекти лише з токенів: градієнти, радіуси, без важких фільтрів", () => {
  const problems: string[] = [];
  for (const file of cssFiles) {
    const css = stripCssComments(readFileSync(file, "utf8"));
    for (const [, value] of css.matchAll(/background-image:\s*([^;]+);/g)) {
      if (!/^(none|var\(--ix-tonal-(raised|pressed)\)|var\(--ix-sheen\), var\(--ix-sheen-band\), var\(--ix-tonal-raised\))$/.test(value!.trim())) problems.push(`${rel(file)}: background-image ${value}`);
    }
    if (/\b(linear|radial|conic)-gradient\(/.test(css)) problems.push(`${rel(file)}: власний градієнт поза токенами`);
    if (/(^|[;{\s])(backdrop-)?filter\s*:/.test(css)) problems.push(`${rel(file)}: filter/backdrop-filter`);
    for (const [, value] of css.matchAll(/border-radius:\s*([^;]+);/g)) {
      // inherit не вводить нового значення: накладка повторює токенний радіус хоста.
      if (value!.trim() === "inherit") continue;
      if (!/^(var\(--ix-radius-[a-z]+\)\s*)+(0\s*)*$/.test(value!.trim().replace(/\s+0/g, " 0"))) problems.push(`${rel(file)}: border-radius ${value}`);
    }
    if (/transition:[^;]*\b(width|height|top|left|margin|padding)\b/.test(css)) problems.push(`${rel(file)}: анімація layout-властивості`);
  }
  assert.deepEqual(problems, []);
});

test("Блиск кнопки: токен --ix-sheen лише в hover піднятих кнопок, без руху при reduced motion", () => {
  const buttonCss = stripCssComments(readFileSync(join(srcRoot, "button", "button.css"), "utf8"));
  const hover = buttonCss.slice(buttonCss.indexOf('.ix-button:not([data-variant="ghost"], [data-variant="accent"]):hover'));
  assert.match(hover.slice(0, hover.indexOf("}")), /background-image:\s*var\(--ix-sheen\), var\(--ix-sheen-band\), var\(--ix-tonal-raised\)/);
  assert.match(buttonCss, /animation:\s*ix-button-sheen var\(--ix-sheen-duration\)/);
  // Натискання скидає блиск: увігнутий стан не повинен світитися.
  const active = buttonCss.slice(buttonCss.indexOf('.ix-button:not([data-variant="ghost"], [data-variant="accent"]):active'));
  assert.match(active.slice(0, active.indexOf("}")), /animation:\s*none/);
  assert.match(buttonCss, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.ix-button\s*\{\s*animation:\s*none/);
  // Анімується лише background-position — без layout-властивостей.
  const keyframes = buttonCss.slice(buttonCss.indexOf("@keyframes ix-button-sheen"));
  assert.doesNotMatch(keyframes.slice(0, keyframes.indexOf("\n}")), /\b(width|height|top|left|margin|padding)\s*:/);
  for (const file of cssFiles.filter((item) => !item.endsWith("button.css"))) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /--ix-sheen/, rel(file));
  }
});

test("Пульсація фокуса: одна утиліта, анімує лише opacity, вимикається при reduced motion", () => {
  const focusCss = stripCssComments(readFileSync(join(srcRoot, "internal", "focus.css"), "utf8"));
  assert.match(focusCss, /\.ix-focus-pulse\s*\{\s*--focus-pulse-shadow:\s*var\(--ix-focus-pulse-shadow\)/);
  assert.match(focusCss, /\.ix-focus-pulse__glow\s*\{\s*display:\s*none/);
  assert.match(focusCss, /animation:\s*ix-focus-pulse var\(--ix-focus-pulse-duration\) var\(--ix-easing-soft\) infinite/);
  // Без руху світіння постійне: фокус на хостах не може зникнути зовсім.
  assert.match(focusCss, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.ix-focus-pulse__glow\s*\{\s*animation:\s*none;\s*opacity:\s*1/);
  // Ключові кадри змінюють лише opacity: постійне світіння під пульсом не слабшає.
  const keyframes = focusCss.slice(focusCss.indexOf("@keyframes ix-focus-pulse"), focusCss.indexOf("@media"));
  for (const [, property] of keyframes.matchAll(/([a-z-]+)\s*:/g)) assert.equal(property, "opacity");
  // Жоден інший файл не оголошує власної пульсації.
  for (const file of cssFiles.filter((item) => !item.endsWith("focus.css"))) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /\.ix-focus-pulse|@keyframes ix-focus-pulse|offset-path/, rel(file));
  }
});
