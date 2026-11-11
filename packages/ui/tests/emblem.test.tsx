import "./setup.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { Emblem } from "../src/index.ts";
import { render } from "./helpers.tsx";

test("Emblem: зображення з доступною назвою, кольори лише з токенів теми", () => {
  const { container, unmount } = render(<Emblem />);
  const svg = container.querySelector("svg")!;
  assert.equal(svg.getAttribute("role"), "img");
  assert.equal(svg.getAttribute("aria-label"), "IndeX");
  // Колір задає CSS через класи; у розмітці немає зашитих fill-кольорів.
  for (const path of svg.querySelectorAll("path")) assert.equal(path.getAttribute("fill"), null);
  assert.ok(svg.querySelector(".ix-emblem__mark") && svg.querySelector(".ix-emblem__ink"));
  unmount();
});

test("Emblem decorative: прихована від зчитувача, коли поруч є назва текстом", () => {
  const { container, unmount } = render(<Emblem decorative />);
  const svg = container.querySelector("svg")!;
  assert.equal(svg.getAttribute("aria-hidden"), "true");
  assert.equal(svg.getAttribute("role"), null);
  unmount();
});
