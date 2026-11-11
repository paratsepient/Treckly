import "./setup.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { act } from "react";
import { BarChart, KpiTile } from "../src/index.ts";
import { niceTicks } from "../src/chart/BarChart.tsx";
import { formatKpiValue } from "../src/chart/KpiTile.tsx";
import { render } from "./helpers.tsx";

const data = [
  { label: "Пн", value: 184 },
  { label: "Вт", value: 241 },
  { label: "Ср", value: 0 },
];

test("niceTicks: круглі поділки від нуля, вершина не нижча за максимум", () => {
  assert.deepEqual(niceTicks(241), [0, 100, 200, 300]);
  assert.deepEqual(niceTicks(9), [0, 2.5, 5, 7.5, 10]);
  assert.deepEqual(niceTicks(0), [0, 1]);
  for (const max of [1, 7, 42, 999, 12_345]) assert.ok(niceTicks(max).at(-1)! >= max, String(max));
});

test("BarChart: фігура з назвою, таблиця для зчитувача, нульовий стовпчик не малюється", () => {
  const { container, unmount } = render(<BarChart title="Донесення за днями" valueLabel="Донесень" data={data} />);
  assert.equal(container.querySelector("figcaption")!.textContent, "Донесення за днями");
  assert.equal(container.querySelector("svg")!.getAttribute("aria-hidden"), "true");
  const rows = [...container.querySelectorAll("table tbody tr")].map((row) => [...row.children].map((cell) => cell.textContent));
  assert.deepEqual(rows, [["Пн", "184"], ["Вт", "241"], ["Ср", "0"]]);
  assert.equal(container.querySelector("thead th:last-child")!.textContent, "Донесень");
  assert.equal(container.querySelectorAll(".ix-bar__bar").length, 2);
  // Без наведення значення підписане лише біля найбільшого стовпчика.
  assert.deepEqual([...container.querySelectorAll(".ix-bar__value")].map((label) => label.textContent), ["241"]);
  unmount();
});

test("BarChart: кінець зі значенням заокруглений, основа пряма; горизонтальні смуги — праворуч", () => {
  const vertical = render(<BarChart title="В" data={[{ label: "А", value: 10 }]} />);
  const column = vertical.container.querySelector(".ix-bar__bar")!.getAttribute("d")!;
  // Дуги лише біля вершини, до основи — пряма V на ту саму висоту, з якої почали.
  assert.match(column, /^M[\d.]+ ([\d.]+)V[\d.]+A4 4 0 0 1 .*V\1Z$/);
  vertical.unmount();
  const horizontal = render(<BarChart title="Г" orientation="horizontal" data={[{ label: "А", value: 10 }]} />);
  const bar = horizontal.container.querySelector(".ix-bar__bar")!.getAttribute("d")!;
  assert.match(bar, /^M([\d.]+) [\d.]+H[\d.]+A4 4 0 0 1 .*H\1Z$/);
  assert.equal(horizontal.container.querySelector("figure")!.getAttribute("data-orientation"), "horizontal");
  horizontal.unmount();
});

test("BarChart: клік штрихує решту й підписує вибраний стовпчик; повторний знімає", () => {
  const { container, unmount } = render(<BarChart title="Т" data={data} />);
  const hits = [...container.querySelectorAll<SVGRectElement>(".ix-bar__hit")];
  // SVG-елемент не має .click(), тож подію надсилаємо напряму.
  const press = (target: Element) => act(() => void target.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
  press(hits[0]!);
  const bars = [...container.querySelectorAll<SVGPathElement>(".ix-bar__bar")];
  assert.deepEqual(bars.map((bar) => bar.hasAttribute("data-hatched")), [false, true]);
  assert.match(bars[1]!.style.fill, /^url\("?#ix-bar-hatch-/);
  assert.deepEqual([...container.querySelectorAll(".ix-bar__value")].map((label) => label.textContent), ["184"]);
  press(hits[0]!);
  assert.equal(container.querySelector("[data-hatched]"), null);
  unmount();
});

test("KpiTile: назва групи, скорочене значення, тон зміни за напрямом і «що добре»", () => {
  assert.equal(formatKpiValue(1284), new Intl.NumberFormat("uk-UA").format(1284));
  assert.notEqual(formatKpiValue(128_450), new Intl.NumberFormat("uk-UA").format(128_450), "≥ 10 000 скорочується");

  const growth = render(<KpiTile label="Донесень за тиждень" value={1284} delta={{ value: 12, period: "до минулого тижня" }} trend={[1, 2, 3]} />);
  const group = growth.container.querySelector('[role="group"]')!;
  assert.equal(document.getElementById(group.getAttribute("aria-labelledby")!)!.textContent, "Донесень за тиждень");
  const change = growth.container.querySelector(".ix-kpi__change")!;
  assert.equal(change.getAttribute("data-tone"), "positive");
  assert.match(change.textContent ?? "", /зростання/, "напрям словом для зчитувача");
  assert.equal(growth.container.querySelector(".ix-kpi__trend")!.getAttribute("aria-hidden"), "true");
  growth.unmount();

  // Час реагування росте — це погано.
  const slower = render(<KpiTile label="Час реагування" value={14} delta={{ value: 3, period: "до минулого тижня", goodWhen: "down" }} />);
  assert.equal(slower.container.querySelector(".ix-kpi__change")!.getAttribute("data-tone"), "negative");
  slower.unmount();

  const flat = render(<KpiTile label="Записів" value={5} delta={{ value: 0, period: "за добу" }} />);
  assert.equal(flat.container.querySelector(".ix-kpi__change")!.getAttribute("data-tone"), "neutral");
  flat.unmount();
});
