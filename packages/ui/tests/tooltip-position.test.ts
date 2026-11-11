import test from "node:test";
import assert from "node:assert/strict";
import { computeTooltipPosition, TOOLTIP_GAP, VIEWPORT_MARGIN } from "../src/tooltip/position.ts";

const viewport = { width: 1440, height: 900 };
const size = { width: 120, height: 28 };

test("Позиція: бажаний бік, коли місця достатньо", () => {
  const anchor = { top: 400, left: 600, width: 80, height: 32 };
  const result = computeTooltipPosition(anchor, size, viewport, "top");
  assert.equal(result.placement, "top");
  assert.equal(result.top, 400 - TOOLTIP_GAP - 28);
  assert.equal(result.left, 600 + 40 - 60);
});

test("Позиція: переворот униз біля верхнього краю", () => {
  const anchor = { top: 10, left: 600, width: 80, height: 32 };
  const result = computeTooltipPosition(anchor, size, viewport, "top");
  assert.equal(result.placement, "bottom");
  assert.equal(result.top, 10 + 32 + TOOLTIP_GAP);
});

test("Позиція: переворот угору біля нижнього краю", () => {
  const anchor = { top: 870, left: 600, width: 80, height: 24 };
  assert.equal(computeTooltipPosition(anchor, size, viewport, "bottom").placement, "top");
});

test("Позиція: притискання до лівого і правого краю", () => {
  const left = computeTooltipPosition({ top: 400, left: 0, width: 32, height: 32 }, size, viewport, "top");
  assert.equal(left.left, VIEWPORT_MARGIN);
  const right = computeTooltipPosition({ top: 400, left: 1420, width: 20, height: 32 }, size, viewport, "top");
  assert.equal(right.left, 1440 - 120 - VIEWPORT_MARGIN);
});

test("Позиція: якщо не вміщується ніде, обирається більший простір і підказка лишається в межах екрана", () => {
  const tall = { width: 120, height: 500 };
  const result = computeTooltipPosition({ top: 300, left: 600, width: 80, height: 32 }, tall, viewport, "top");
  assert.equal(result.placement, "bottom");
  assert.ok(result.top >= VIEWPORT_MARGIN && result.top + 500 <= 900 - VIEWPORT_MARGIN);
});

test("Позиція: вузький екран 375 px", () => {
  const result = computeTooltipPosition({ top: 400, left: 340, width: 32, height: 32 }, { width: 240, height: 40 }, { width: 375, height: 812 }, "top");
  assert.equal(result.left, 375 - 240 - VIEWPORT_MARGIN);
});

test("Позиція: праворуч від пункту колонки, по центру вертикально", () => {
  const anchor = { top: 200, left: 8, width: 48, height: 48 };
  const result = computeTooltipPosition(anchor, size, viewport, "right");
  assert.equal(result.placement, "right");
  assert.equal(result.left, 8 + 48 + TOOLTIP_GAP);
  assert.equal(result.top, 200 + 24 - 14);
});

test("Позиція: ліворуч перевертається праворуч біля лівого краю", () => {
  const anchor = { top: 200, left: 20, width: 48, height: 48 };
  const result = computeTooltipPosition(anchor, size, viewport, "left");
  assert.equal(result.placement, "right");
  assert.equal(result.left, 20 + 48 + TOOLTIP_GAP);
});

test("Позиція: бічна підказка притискається до верхнього краю", () => {
  const anchor = { top: 0, left: 600, width: 40, height: 10 };
  const result = computeTooltipPosition(anchor, size, viewport, "right");
  assert.equal(result.top, VIEWPORT_MARGIN);
});
