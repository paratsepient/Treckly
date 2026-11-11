import test from "node:test";
import assert from "node:assert/strict";
import {
  activePalette,
  contrastComfortMargin,
  durations,
  easings,
  evaluateTheme,
  formatRatio,
  paletteNames,
  paletteRadii,
  paletteShadows,
  paletteSheen,
  paletteSheenBand,
  sheenHeight,
  spacing,
  textStyles,
  paletteTonal,
  radii,
  themeNames,
  tonalEffectNames,
} from "../src/index.ts";
import { renderAll, renderCss } from "../scripts/render.ts";

test("Технічний запас контрасту: активна версія перевищує кожен поріг щонайменше на 5 %", () => {
  for (const theme of themeNames) {
    const gaps = evaluateTheme(theme, activePalette)
      .filter((result) => result.threshold !== null && result.ratio < result.threshold * contrastComfortMargin)
      .map((result) => `${theme}: ${result.label} ${formatRatio(result.ratio)}`);
    assert.deepEqual(gaps, []);
  }
});

test("Тональні ефекти: у tokens.css для кожної теми, напівпрозорі, без градієнтів у версіях до v1.2", () => {
  const css = renderCss();
  for (const name of tonalEffectNames) {
    assert.equal(css.split(`--ix-tonal-${name}: `).length - 1, 3, name);
  }
  for (const palette of paletteNames) {
    for (const theme of themeNames) {
      for (const name of tonalEffectNames) {
        const effect = paletteTonal[palette][theme][name];
        if (effect === null) continue;
        // Тональний перехід має бути ледь помітним: інакше це вже декоративний градієнт.
        assert.ok(effect.alpha !== undefined && effect.alpha > 0 && effect.alpha <= 0.15, `${palette}/${theme}/${name}`);
      }
    }
  }
  assert.equal(paletteTonal["muted-graphite"].light.raised, null);
});

test("Блиск при наведенні: лише у v1.2, відблиск по верхньому краю не доходить до рядка тексту", () => {
  const css = renderCss();
  assert.equal(css.split("--ix-sheen: ").length - 1, 3);
  for (const palette of paletteNames) {
    for (const theme of themeNames) {
      const sheen = paletteSheen[palette][theme];
      if (palette !== activePalette) {
        assert.equal(sheen, null, `${palette}/${theme}`);
        continue;
      }
      assert.ok(sheen && sheen.alpha !== undefined && sheen.alpha > 0 && sheen.alpha <= 0.5, `${theme}`);
    }
  }
  // Кнопка: висота space-8, рядок body-strong по центру. Видна половина еліпса має
  // згаснути до верхньої межі рядка — інакше блиск змінює фон під текстом.
  const lineTop = (spacing["8"] - textStyles["body-strong"].lineHeight) / 2;
  assert.ok(sheenHeight / 2 <= lineTop, `відблиск ${sheenHeight / 2}px > ${lineTop}px до рядка`);
  assert.equal(css.split("--ix-sheen-height: ").length - 1, 1);
});

test("Смуга блиску через усю кнопку: лише у v1.2, з перевіркою тексту під піком", () => {
  const css = renderCss();
  assert.equal(css.split("--ix-sheen-band: ").length - 1, 3);
  for (const palette of paletteNames) {
    for (const theme of themeNames) {
      const band = paletteSheenBand[palette][theme];
      if (palette !== activePalette) {
        assert.equal(band, null, `${palette}/${theme}`);
        continue;
      }
      assert.ok(band && band.alpha !== undefined && band.alpha > 0, theme);
      const pairs = evaluateTheme(theme, palette).filter((result) => result.effect === "sheen");
      // Текст трьох піднятих типів кнопок (primary, secondary, destructive) і акцент іконки
      // на вторинній кнопці в hover; контурна accent блиску не має.
      assert.equal(pairs.length, 4, theme);
      for (const pair of pairs) {
        assert.ok(pair.ratio >= pair.threshold! * contrastComfortMargin, `${theme}: ${pair.label} ${formatRatio(pair.ratio)}`);
      }
    }
  }
});

test("Soft Raised Control і inset існують лише у v1.2; рівні Flat не мають тіні", () => {
  for (const theme of themeNames) {
    for (const name of ["control", "control-pressed", "inset"] as const) {
      assert.ok(paletteShadows[activePalette][theme][name].length > 0, `${theme}/${name}`);
      assert.equal(paletteShadows["muted-graphite"][theme][name].length, 0, `v1.1 ${theme}/${name}`);
    }
    // Відблиск — лише всередині елемента: падаючі шари зі світлим кольором були б glow.
    for (const [name, layers] of Object.entries(paletteShadows[activePalette][theme])) {
      for (const layer of layers) {
        // Виняток — освітлений нижній край гнізда кнопки (розмитий відблиск під кнопкою).
        if (layer.color === "white" && name !== "socket") assert.ok(layer.inset, `${theme}/${name}: світла тінь назовні — це glow`);
      }
    }
  }
});

test("Лунка без обводки лише у v1.2; старі палітри зберігають контур border-strong", () => {
  const css = renderCss();
  assert.equal(css.split("--ix-well-border: transparent;").length - 1, 3);
  for (const palette of paletteNames.filter((name) => name !== activePalette)) {
    const comparison = renderAll()[`generated/comparison/palette-${palette}.css`] ?? "";
    assert.match(comparison, /--ix-well-border: var\(--ix-border-strong\);/, palette);
  }
});

test("Форма: компактна шкала радіусів, v1.1 відтворюється для порівняння", () => {
  const values = Object.entries(radii).filter(([name]) => name !== "round").map(([, token]) => token.value);
  assert.ok(Math.max(...values) <= 12, "найбільший радіус — 12 px");
  assert.equal(radii.none.value, 0, "таблиці й рядки без радіуса");
  assert.equal(paletteRadii["muted-graphite"].control, 4);
  assert.equal(paletteRadii["muted-graphite"].container, 8);
  const comparison = renderAll()["generated/comparison/palette-muted-graphite.css"] ?? "";
  assert.match(comparison, /--ix-radius-control: 4px;/);
  assert.match(comparison, /--ix-tonal-raised: none;/);
  assert.match(comparison, /--ix-shadow-control: none;/);
});

test("Motion: короткі тривалості, без overshoot, reduced motion обнуляє тривалості", () => {
  assert.ok(Object.values(durations).every((value) => value <= 240));
  for (const [name, value] of Object.entries(easings)) {
    const points = value.match(/-?\d*\.?\d+/g)!.map(Number);
    assert.ok(points.every((point) => point >= 0 && point <= 1), `${name}: overshoot`);
  }
  const css = renderCss();
  const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  for (const name of Object.keys(durations)) {
    assert.match(reduced, new RegExp(`--ix-duration-${name}: 0ms;`));
  }
});
