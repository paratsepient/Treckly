import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  activePalette,
  checkId,
  colorScales,
  colorSteps,
  contrastChecks,
  deprecatedShadowAliases,
  disabledLegibilityMinimum,
  elevationLevels,
  evaluateTheme,
  formatRatio,
  interSubsets,
  layoutModeForWidth,
  layoutSizes,
  isHexColor,
  paletteNames,
  palettes,
  paletteShadows,
  parseHex,
  primitiveColors,
  relativeLuminance,
  semanticColorNames,
  shadowNames,
  spacing,
  spacingBase,
  textStyles,
  themeNames,
  themes,
} from "../src/index.ts";
import { renderAll, renderCss } from "../scripts/render.ts";

const packageRoot = join(import.meta.dirname, "..");

test("Примітиви мають формат #RRGGBB", () => {
  for (const [name, hex] of Object.entries(primitiveColors)) {
    assert.ok(isHexColor(hex), `${name}: ${hex}`);
  }
});

test("Кожна шкала темнішає від 50 до 950", () => {
  for (const [scale, values] of Object.entries(colorScales)) {
    for (let index = 1; index < colorSteps.length; index += 1) {
      const lighter = colorSteps[index - 1]!;
      const darker = colorSteps[index]!;
      assert.ok(
        relativeLuminance(parseHex(values[lighter])) >
          relativeLuminance(parseHex(values[darker])),
        `${scale}-${lighter} має бути світлішим за ${scale}-${darker}`,
      );
    }
  }
});

test("Кожна палітра й тема визначає однаковий набір семантичних токенів", () => {
  for (const palette of paletteNames) {
    for (const theme of themeNames) {
      assert.deepEqual(Object.keys(palettes[palette][theme]).sort(), [...semanticColorNames].sort(), `${palette}/${theme}`);
    }
  }
  assert.equal(themes, palettes[activePalette], "themes — це mapping активної палітри");
});

test("Семантичні токени посилаються лише на наявні примітиви (зокрема tint)", () => {
  for (const palette of paletteNames) {
    for (const theme of themeNames) {
      for (const [name, reference] of Object.entries(palettes[palette][theme])) {
        const where = `${palette}/${theme}/${name}`;
        assert.ok(reference.ref in primitiveColors, `${where} → ${reference.ref}`);
        if (reference.alpha !== undefined) {
          assert.ok(reference.alpha > 0 && reference.alpha < 1, `${where}: alpha ${reference.alpha}`);
        }
        if (reference.tint !== undefined) {
          assert.ok(reference.tint.ref in primitiveColors, `${where}: tint ${reference.tint.ref}`);
          assert.ok(reference.tint.amount > 0 && reference.tint.amount < 1, `${where}: amount`);
          assert.equal(reference.alpha, undefined, `${where}: tint і alpha разом`);
        }
      }
    }
  }
});

test("Ідентифікатори перевірок контрасту унікальні, винятки пояснені", () => {
  const ids = contrastChecks.map((check) => check.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const check of contrastChecks) {
    if (check.requirement === "disabled" || check.requirement === "decorative") {
      assert.ok(check.note, `${check.label}: виняток без пояснення`);
    }
  }
});

test("Декоративний виняток має компенсацію, disabled — внутрішній мінімум", () => {
  const ids = new Set(contrastChecks.map((check) => check.id));
  for (const check of contrastChecks) {
    if (check.requirement === "decorative") {
      assert.ok(check.compensatedBy?.length, `${check.label}: немає компенсації`);
      for (const id of check.compensatedBy ?? []) {
        assert.ok(ids.has(id), `${check.label}: невідома компенсація ${id}`);
        assert.ok(!id.startsWith("decorative:") && !id.startsWith("disabled:"), `${id}: компенсація не може бути винятком`);
      }
    }
    if (check.requirement === "disabled") {
      assert.equal(check.minimum, disabledLegibilityMinimum, check.label);
    }
  }
});

test("Вибір не може бути позначений лише тоном заливки", () => {
  const selection = contrastChecks.find((check) => check.id === checkId("decorative", "selection-background", ["surface"]));
  assert.ok(selection?.compensatedBy?.includes(checkId("non-text", "selection-indicator", ["surface"])));
});

for (const palette of paletteNames) for (const theme of themeNames) {
  test(`Контраст ${palette}/${theme}: усі обов'язкові пари проходять пороги WCAG`, () => {
    const failures = evaluateTheme(theme, palette)
      .filter((result) => result.status === "fail")
      .map(
        (result) =>
          `${result.label}: ${formatRatio(result.ratio)} < ${result.threshold}`,
      );
    assert.deepEqual(failures, []);
  });
}

test("Відступи кратні базовому кроку", () => {
  for (const [name, value] of Object.entries(spacing)) {
    assert.equal(value % spacingBase, 0, `space-${name}`);
  }
});

test("Робочий текст не дрібніший за 12 px, висота рядка кратна 4 px", () => {
  for (const [name, style] of Object.entries(textStyles)) {
    assert.ok(style.size >= 12, name);
    assert.equal(style.lineHeight % 4, 0, name);
  }
  assert.ok(textStyles.body.size >= 14 && textStyles.body.size <= 16);
});

test("CSS містить кожен семантичний токен для light, dark і системної теми", () => {
  const css = renderCss();
  for (const name of semanticColorNames) {
    const declarations = css.match(new RegExp(`--ix-${name}: `, "g")) ?? [];
    assert.equal(declarations.length, 3, name);
  }
});

test("Палітра порівняння: окремий файл, кожен токен у light/dark/системній темі під [data-palette]", () => {
  const files = renderAll();
  for (const palette of paletteNames.filter((name) => name !== activePalette)) {
    const css = files[`generated/comparison/palette-${palette}.css`] ?? "";
    assert.ok(css.includes(`[data-palette="${palette}"]`), palette);
    for (const name of semanticColorNames) {
      assert.equal((css.match(new RegExp(`--ix-${name}: `, "g")) ?? []).length, 3, `${palette}: ${name}`);
    }
    assert.ok(!/--ix-color-[a-z0-9-]+:/.test(css), "примітиви не оголошуються вдруге: беруться з tokens.css");
  }
  assert.ok(!renderCss().includes("data-palette"), "основний tokens.css не містить палітр порівняння");
});

test("Elevation: card/floating/modal у кожній темі, застарілі назви — аліаси", () => {
  const css = renderCss();
  for (const name of shadowNames) {
    assert.equal((css.match(new RegExp(`--ix-shadow-${name}: `, "g")) ?? []).length, 3, name);
  }
  for (const [alias, target] of Object.entries(deprecatedShadowAliases)) {
    assert.equal(css.split(`--ix-shadow-${alias}: var(--ix-shadow-${target});`).length - 1, 3, alias);
  }
  for (const palette of paletteNames) {
    for (const theme of themeNames) {
      for (const name of shadowNames) {
        for (const layer of paletteShadows[palette][theme][name]) {
          assert.ok(layer.color in primitiveColors, `${palette}/${theme}/${name}`);
          assert.ok(layer.alpha > 0 && layer.alpha < 1, `${palette}/${theme}/${name}`);
        }
      }
    }
  }
  assert.equal(elevationLevels.flat.shadow, null, "рівень 0 без тіні");
});

test("Примітиви оголошені в CSS рівно один раз (не залежать від теми)", () => {
  const css = renderCss();
  for (const name of Object.keys(primitiveColors)) {
    const declarations = css.match(new RegExp(`--ix-color-${name}: `, "g")) ?? [];
    assert.equal(declarations.length, 1, name);
  }
});

test("Генерація детермінована й збігається з файлами на диску", () => {
  const first = renderAll();
  assert.deepEqual(renderAll(), first);
  for (const [file, content] of Object.entries(first)) {
    const onDisk = readFileSync(join(packageRoot, file), "utf8").replace(/\r\n/g, "\n");
    assert.equal(onDisk, content, `${file} застарів або змінений вручну`);
  }
});

test("Генерація в окремому процесі дає ті самі файли (--check)", () => {
  const result = spawnSync(process.execPath, [join(packageRoot, "scripts", "generate.ts"), "--check"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
});

test("Inter постачається локально: файли з маніфесту, ліцензія OFL, без CDN", () => {
  const fontsDir = join(packageRoot, "fonts", "inter");
  const manifest = JSON.parse(readFileSync(join(fontsDir, "manifest.json"), "utf8")) as {
    license: string;
    files: Record<string, string>;
  };
  assert.equal(manifest.license, "SIL Open Font License 1.1");
  assert.match(readFileSync(join(fontsDir, "OFL.txt"), "utf8"), /SIL Open Font License, Version 1\.1/);
  for (const [file, hash] of Object.entries(manifest.files)) {
    const actual = createHash("sha256").update(readFileSync(join(fontsDir, file))).digest("hex");
    assert.equal(actual, hash, file);
  }
  const fontsCss = renderAll()["generated/fonts.css"] ?? "";
  for (const subset of interSubsets) {
    assert.ok(fontsCss.includes(`url("../fonts/inter/${subset.file}")`), subset.file);
    assert.ok(subset.file in manifest.files, subset.file);
  }
  assert.ok(!/https?:\/\//.test(fontsCss), "fonts.css не може посилатися на мережу");
  assert.ok(renderCss().includes('@import "./fonts.css";'));
});

function listFiles(folder: string): string[] {
  return readdirSync(folder).flatMap((entry) => {
    const path = join(folder, entry);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

test("HEX-літерали є лише в реєстрі примітивів", () => {
  const allowed = join(packageRoot, "src", "primitives", "colors.ts");
  // Тести із заздалегідь відомими еталонами WCAG свідомо не скануємо.
  const roots = ["src", "scripts", "preview"].map((folder) => join(packageRoot, folder));
  const offenders = roots
    .flatMap(listFiles)
    .filter((file) => file !== allowed)
    .filter((file) => /#[0-9A-Fa-f]{6}\b|#[0-9A-Fa-f]{3}\b/.test(readFileSync(file, "utf8")))
    .map((file) => relative(packageRoot, file));
  assert.deepEqual(offenders, []);
});

test("Layout: розміри кратні 4 px, режими відповідають межам", () => {
  for (const [name, value] of Object.entries(layoutSizes)) {
    assert.equal(value % spacingBase, 0, name);
  }
  assert.equal(layoutModeForWidth(375), "compact");
  assert.equal(layoutModeForWidth(768), "medium");
  assert.equal(layoutModeForWidth(1024), "large");
  assert.equal(layoutModeForWidth(1279), "large");
  assert.equal(layoutModeForWidth(1440), "wide");
});
