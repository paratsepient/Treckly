import "./setup.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { DonutChart, PieChart } from "../src/index.ts";
import { act } from "react";
import { render } from "./helpers.tsx";

const tableRows = (container: HTMLElement) =>
  [...container.querySelectorAll("table tbody tr")].map((row) => [...row.children].map((cell) => cell.textContent));

test("DonutChart: фігура з назвою, сума в центрі, таблиця для зчитувача", () => {
  const { container, unmount } = render(
    <DonutChart title="Стан техніки" centerLabel="одиниць" data={[{ label: "Справна", value: 30 }, { label: "Ремонт", value: 10 }]} />,
  );
  assert.equal(container.querySelector("figcaption")!.textContent, "Стан техніки");
  // Графіка й легенда дублюють таблицю, тому приховані від зчитувача.
  assert.equal(container.querySelector("svg")!.getAttribute("aria-hidden"), "true");
  assert.equal(container.querySelector(".ix-chart__legend")!.getAttribute("aria-hidden"), "true");
  assert.match(container.querySelector(".ix-chart__total")!.textContent ?? "", /40/);
  const rows = tableRows(container);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]![0], "Справна");
  assert.match(rows[0]![2] ?? "", /75/);
  assert.equal(container.querySelectorAll(".ix-chart__slice").length, 2);
  unmount();
});

test("Категоріальні кольори за порядком, понад шість частин — «Інше»", () => {
  const data = Array.from({ length: 8 }, (_, index) => ({ label: `Частина ${index + 1}`, value: 10 }));
  const { container, unmount } = render(<PieChart title="Розподіл" data={data} />);
  const swatches = [...container.querySelectorAll<HTMLElement>(".ix-chart__swatch")].map((item) => item.style.backgroundColor);
  assert.equal(swatches.length, 6);
  assert.deepEqual(swatches.slice(0, 5), [1, 2, 3, 4, 5].map((slot) => `var(--ix-chart-${slot})`));
  assert.equal(swatches[5], "var(--ix-chart-other)");
  const rows = tableRows(container);
  assert.equal(rows.at(-1)![0], "Інше");
  assert.equal(rows.at(-1)![1], "30");
  unmount();
});

test("Розбіжна схема: колір задає тон відповіді, без тону — нейтральний", () => {
  const { container, unmount } = render(
    <DonutChart
      title="Оцінка"
      scheme="diverging"
      data={[
        { label: "Повністю згоден", value: 15, tone: "positive-3" },
        { label: "Нейтрально", value: 29 },
        { label: "Не згоден", value: 17, tone: "negative-2" },
      ]}
    />,
  );
  const swatches = [...container.querySelectorAll<HTMLElement>(".ix-chart__swatch")].map((item) => item.style.backgroundColor);
  assert.deepEqual(swatches, ["var(--ix-chart-positive-3)", "var(--ix-chart-neutral)", "var(--ix-chart-negative-2)"]);
  unmount();
});

test("Одна частина — повне коло; нульові частини не малюються", () => {
  const { container, unmount } = render(<PieChart title="Готовність" data={[{ label: "Готово", value: 5 }, { label: "Ні", value: 0 }]} />);
  assert.equal(container.querySelectorAll(".ix-chart__slice").length, 1);
  assert.equal(tableRows(container).length, 1);
  unmount();
});

test("Наведення й клік: решта секторів штрихується, повторний клік знімає вибір", () => {
  const { container, unmount } = render(
    <PieChart title="Розподіл" data={[{ label: "А", value: 3 }, { label: "Б", value: 2 }, { label: "В", value: 1 }]} />,
  );
  const slices = () => [...container.querySelectorAll<SVGPathElement>(".ix-chart__slice")];
  const hatched = () => slices().map((slice) => slice.hasAttribute("data-hatched"));
  // SVG-шлях не має .click(), тож подію надсилаємо напряму.
  const press = (slice: SVGPathElement) => act(() => void slice.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
  assert.deepEqual(hatched(), [false, false, false]);
  // Кожен сектор має власний візерунок штрихування свого кольору.
  assert.equal(container.querySelectorAll("pattern").length, 3);

  press(slices()[1]!);
  assert.deepEqual(hatched(), [true, false, true]);
  assert.match(slices()[0]!.style.fill, /^url\("?#ix-chart-hatch-/);
  assert.equal(slices()[1]!.style.fill, "var(--ix-chart-2)");

  press(slices()[1]!);
  assert.deepEqual(hatched(), [false, false, false]);
  unmount();
});
