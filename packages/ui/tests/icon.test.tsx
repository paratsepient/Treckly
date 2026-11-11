import "./setup.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Icon, iconNames } from "../src/index.ts";
import { render } from "./helpers.tsx";

/** Іконки, де акцент — головна деталь і лежить поверх контуру (рішення 2026-11-04). */
const accentOnTopIcons = new Set(["back", "forward", "move-up", "move-down", "archive", "add-bend", "remove-bend", "undo", "redo", "widget-settings", "separate", "merge", "refresh", "trend-up", "trend-down", "trend-flat", "calendar", "merge-join"]);
import { nearestDistance, samplePath, type Point } from "./icon-geometry.ts";

test("Icon: за замовчуванням декоративна, з title — зображення з назвою", () => {
  const decorative = render(<Icon name="add" />);
  const svg = decorative.container.querySelector("svg")!;
  assert.equal(svg.getAttribute("aria-hidden"), "true");
  assert.equal(svg.getAttribute("role"), null);
  assert.equal(svg.getAttribute("data-size"), "20");
  decorative.unmount();

  const named = render(<Icon name="delete" size={16} title="Видалити" />);
  const img = named.container.querySelector("svg")!;
  assert.equal(img.getAttribute("role"), "img");
  assert.equal(img.getAttribute("aria-label"), "Видалити");
  assert.equal(img.getAttribute("data-size"), "16");
  named.unmount();
});

test("Набір іконок: кожна має контур, геометрія в межах сітки 24, кольори лише ролями", () => {
  assert.ok(iconNames.length >= 70, `іконок ${iconNames.length}`);
  for (const name of iconNames) {
    const { container, unmount } = render(<Icon name={name} />);
    const base = container.querySelectorAll(".ix-icon__base");
    assert.ok(base.length > 0, `${name}: немає контуру`);
    for (const path of container.querySelectorAll(".ix-icon__base, .ix-icon__accent")) {
      const d = path.getAttribute("d") ?? "";
      assert.doesNotMatch(d, /NaN|undefined/, name);
      // Порядок шарів: зверху контур, а для іконок з акцентом-головною деталлю — акцент.
      const roles = [...container.querySelectorAll(".ix-icon__base, .ix-icon__accent")].map((item) => item.getAttribute("class"));
      const top = accentOnTopIcons.has(name) ? "ix-icon__accent" : "ix-icon__base";
      const under = top === "ix-icon__base" ? "ix-icon__accent" : "ix-icon__base";
      if (roles.includes(under)) assert.ok(roles.lastIndexOf(under) < roles.indexOf(top), `${name}: зверху має бути ${top}`);
      // Колір задає CSS за роллю (base / accent), не атрибути розмітки.
      assert.equal(path.getAttribute("fill"), null, name);
      assert.equal(path.getAttribute("stroke"), null, name);
      // Абсолютні координати не виходять за сітку 24 × 24.
      for (const [, x, y] of d.matchAll(/[ML](-?\d*\.?\d+) (-?\d*\.?\d+)/g)) {
        assert.ok(Number(x) >= 0 && Number(x) <= 24 && Number(y) >= 0 && Number(y) <= 24, `${name}: ${x} ${y}`);
      }
    }
    unmount();
  }
});

/** Одноколірні за задумом: службовий знак, що не має привертати увагу. */
const monoIcons = new Set(["close", "filter"]);
const step = 0.1;
/** Лінія 1.5: центри ближче — лінії накладаються; ближче 2.4 — проміжок < 0.9, на 16 px злипається. */
const overlapDistance = 1.5;
const tightDistance = 2.4;

test("Набір іконок: акцент є, лінії в полі 1–23, без накладення кольорів і злиплих деталей", () => {
  const problems: string[] = [];
  for (const name of iconNames) {
    const { container, unmount } = render(<Icon name={name} />);
    const paths = [...container.querySelectorAll(".ix-icon__base, .ix-icon__accent")].map((path, index) => ({
      index,
      role: path.classList.contains("ix-icon__accent") ? "accent" : "base",
      ...samplePath(path.getAttribute("d") ?? "", step),
    }));
    unmount();
    if (!monoIcons.has(name) && !paths.some((path) => path.role === "accent")) problems.push(`${name}: немає акценту`);
    // Разом із половиною лінії чорнило лишається в полі 1–23 сітки 24.
    if (paths.some((path) => path.points.some((point) => Math.min(point.x, point.y) < 1.75 || Math.max(point.x, point.y) > 22.25))) {
      problems.push(`${name}: лінія виходить за поле 1–23`);
    }
    for (let a = 0; a < paths.length; a += 1) {
      for (let b = a + 1; b < paths.length; b += 1) {
        const first = paths[a]!;
        const second = paths[b]!;
        const distanceTo = nearestDistance(second.points);
        const ends = [...first.ends, ...second.ends];
        // Біля кінців ліній з'єднання навмисні (з'єднувачі, вістря стрілок).
        const nearEnd = (point: Point, radius: number) => ends.some((end) => Math.hypot(end.x - point.x, end.y - point.y) < radius);
        const distances = first.points.map(distanceTo);
        // Біля місця дотику чи перетину ліній проміжок неминуче малий — це вузол, а не злипання.
        const contacts = first.points.filter((_, i) => distances[i]! < overlapDistance);
        const distanceToContact = contacts.length > 0 ? nearestDistance(contacts) : () => Number.POSITIVE_INFINITY;
        let overlap = 0;
        let tight = 0;
        first.points.forEach((point, i) => {
          const distance = distances[i]!;
          if (distance < overlapDistance) {
            // Перетин ліній одного кольору (плюс, хрестик) — частина малюнка; різних — ні.
            if (first.role !== second.role && !nearEnd(point, 2.25)) overlap += step;
          } else if (distance < tightDistance && !nearEnd(point, tightDistance) && distanceToContact(point) > 2) {
            tight += step;
          }
        });
        if (overlap > 0.4) problems.push(`${name}: акцент лягає на контур (#${first.index}/#${second.index}, ${overlap.toFixed(1)})`);
        if (tight > 0.8) problems.push(`${name}: деталі злипаються (#${first.index}/#${second.index}, ${tight.toFixed(1)})`);
      }
    }
  }
  assert.deepEqual(problems, []);
});

test("Набір іконок: нижній шар вирізається під верхнім — між кольорами завжди проміжок", () => {
  for (const name of iconNames) {
    const { container, unmount } = render(<Icon name={name} />);
    const topClass = accentOnTopIcons.has(name) ? "ix-icon__accent" : "ix-icon__base";
    const bottomClass = topClass === "ix-icon__base" ? "ix-icon__accent" : "ix-icon__base";
    const top = container.querySelectorAll(`svg > .${topClass}`);
    const bottom = container.querySelectorAll(`.${bottomClass}`);
    if (bottom.length > 0 && top.length > 0) {
      const group = container.querySelector("g[mask]")!;
      const mask = container.querySelector(group.getAttribute("mask")!.slice(4, -1))!;
      assert.equal(mask.tagName.toLowerCase(), "mask", name);
      // Виріз — це контури верхнього шару, ширші за лінію.
      assert.deepEqual([...mask.querySelectorAll("path")].map((path) => path.getAttribute("d")), [...top].map((path) => path.getAttribute("d")), name);
      assert.ok(Number(mask.querySelector("path")!.getAttribute("stroke-width")) > 1.5, name);
      assert.ok([...bottom].every((path) => group.contains(path)), `${name}: нижній шар поза маскою`);
    } else {
      assert.equal(container.querySelector("mask"), null, name);
    }
    unmount();
  }
});

test("Галерея playground показує кожну іконку набору", () => {
  // Тест зібрано в dist/test-build/tests: шлях до вихідного playground від кореня пакета.
  const playground = readFileSync(new URL("../../../playground/main.tsx", import.meta.url), "utf8");
  const shown = new Set(Array.from(playground.matchAll(/\["([a-z0-9-]+)", "[^"]+"\]/g), (match) => match[1]));
  assert.deepEqual(iconNames.filter((name) => !shown.has(name)), []);
});
