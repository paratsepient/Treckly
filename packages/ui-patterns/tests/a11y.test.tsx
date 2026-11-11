import "./setup.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { FullShell, axeViolations, click, render, setViewportWidth } from "./helpers.tsx";

test("axe: повний каркас на 1440 px (обидві панелі закріплені)", async () => {
  setViewportWidth(1440);
  const { unmount } = render(<FullShell defaultInspectorOpen />);
  assert.deepEqual(await axeViolations(document.body), []);
  unmount();
});

test("axe: каркас на 375 px з відкритим Drawer навігації", async () => {
  setViewportWidth(375);
  const { unmount } = render(<FullShell />);
  click(document.querySelector("button[aria-label='Відкрити навігацію']")!);
  assert.ok(document.querySelector("dialog[open]"));
  assert.deepEqual(await axeViolations(document.body), []);
  unmount();
  setViewportWidth(1440);
});

test("axe: згорнутий sidebar на 1024 px з Drawer інспектора", async () => {
  setViewportWidth(1024);
  const { unmount } = render(<FullShell />);
  click(document.querySelector("button[aria-label='Показати: Властивості']")!);
  assert.ok(document.querySelector("dialog[open][aria-label='Властивості']"));
  assert.deepEqual(await axeViolations(document.body), []);
  unmount();
  setViewportWidth(1440);
});

test("Ландмарки: одна main, навігація й панелі мають доступні назви", () => {
  setViewportWidth(1440);
  const { unmount } = render(<FullShell defaultInspectorOpen />);
  assert.equal(document.querySelectorAll("main").length, 1);
  assert.equal(document.querySelector("nav[aria-label='Головна навігація']") !== null, true);
  for (const panel of document.querySelectorAll("section.ixp-panel")) {
    const id = panel.getAttribute("aria-labelledby")!;
    assert.ok(document.getElementById(id)?.textContent, "панель має заголовок");
  }
  unmount();
});
