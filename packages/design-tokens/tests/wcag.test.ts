import test from "node:test";
import assert from "node:assert/strict";
import {
  composite,
  contrastRatio,
  formatRatio,
  parseHex,
  relativeLuminance,
  toHex,
} from "../src/index.ts";

// Еталонні значення взято з визначень WCAG, а не з власного коду,
// щоб помилка у формулі не «підтвердила» сама себе.

test("Білий і чорний мають контраст 21:1", () => {
  const ratio = contrastRatio(parseHex("#FFFFFF"), parseHex("#000000"));
  assert.equal(ratio, 21);
});

test("Однакові кольори мають контраст 1:1", () => {
  assert.equal(contrastRatio(parseHex("#5F6467"), parseHex("#5F6467")), 1);
});

test("Контраст симетричний", () => {
  const a = parseHex("#525A2D");
  const b = parseHex("#F6F8F9");
  assert.equal(contrastRatio(a, b), contrastRatio(b, a));
});

test("#767676 на білому — відома межа AA (≈4.54)", () => {
  const ratio = contrastRatio(parseHex("#767676"), parseHex("#FFFFFF"));
  assert.ok(ratio > 4.54 && ratio < 4.55, `отримано ${ratio}`);
});

test("Relative luminance у межах 0–1 і монотонна для сірих", () => {
  assert.equal(relativeLuminance(parseHex("#000000")), 0);
  assert.equal(relativeLuminance(parseHex("#FFFFFF")), 1);
  assert.ok(
    relativeLuminance(parseHex("#808080")) <
      relativeLuminance(parseHex("#818181")),
  );
});

test("Накладання alpha враховує фактичний фон", () => {
  const black = parseHex("#000000");
  const white = parseHex("#FFFFFF");
  assert.equal(toHex(composite(black, 0.5, white)), "#808080");
  assert.equal(toHex(composite(black, 0, white)), "#FFFFFF");
  assert.equal(toHex(composite(black, 1, white)), "#000000");
  assert.throws(() => composite(black, 1.2, white), /Alpha/);
});

test("Форматування відкидає, а не округлює", () => {
  assert.equal(formatRatio(4.4999), "4.49");
  assert.equal(formatRatio(4.5), "4.50");
});

test("Некоректний HEX відхиляється", () => {
  assert.throws(() => parseHex("#fff"), /Некоректний HEX/);
  assert.throws(() => parseHex("#abcdef"), /Некоректний HEX/);
});
