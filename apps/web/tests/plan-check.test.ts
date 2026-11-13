import assert from "node:assert/strict";
import test from "node:test";
import { planCheck, type PlanPosition, type PlanRow } from "../src/lib/plan-check.ts";

const positions: readonly PlanPosition[] = [
  { id: "p1", code: "ПМ-001", name: "Акумулятор", kekv: "2210", priceMinor: 100, availableQty: 50 },
  { id: "p2", code: "ПМ-002", name: "Радіостанція", kekv: "2210", priceMinor: 100, availableQty: 5 },
  { id: "p3", code: "ОБ-003", name: "Тепловізор", kekv: "3110", priceMinor: 100, availableQty: 15 },
];
const property: readonly PlanRow[] = [
  { code: "ПМ-001", qty: 20, tab: "planned" },
  { code: "ПМ-001", qty: 99, tab: "on_base" },
  { code: "ПМ-002", qty: 10, tab: "planned" },
  { code: "ОБ-003", qty: 8, tab: "received" },
];
const by = (id: string, positionId: string, qty: number, kekv = "2210") => ({ kind: "by_list" as const, id, positionId, qty, kekv });

test("звірка: відповідає, коли позиція є в переліку й плані в/ч, КЕКВ збігається, кількість у межах", () => {
  const { lines, mismatches } = planCheck({ lines: [by("l1", "p1", 20)] }, positions, property);
  assert.equal(lines[0]?.verdict, "ok");
  assert.equal(lines[0]?.planned, 20, "рахується лише вкладка «Заплановано», а не «На базі»");
  assert.equal(mismatches, 0);
});

test("звірка: кожна розбіжність має свій вердикт", () => {
  const request = {
    lines: [
      by("l1", "p1", 21), // більше за план в/ч (20)
      by("l2", "p2", 8), // у плані 10, але за переліком доступно лише 5
      by("l3", "p3", 1, "3110"), // тепловізор лише «Отримано», у плані немає
      by("l4", "px", 1), // немає в переліку
      by("l5", "p1", 1, "3110"), // КЕКВ не збігається (перевіряється перед кількістю)
    ],
  };
  const verdicts = planCheck(request, positions, property).lines.map((l) => l.verdict);
  assert.deepEqual(verdicts, ["over_plan", "over_available", "not_planned", "not_in_list", "kekv"]);
});

test("звірка: КЕКВ перевіряється, коли кількість у межах", () => {
  assert.equal(planCheck({ lines: [by("l1", "p1", 1, "3110")] }, positions, property).lines[0]?.verdict, "kekv");
});

test("звірка: кількість однієї позиції в кількох рядках підсумовується", () => {
  const { lines } = planCheck({ lines: [by("l1", "p1", 12), by("l2", "p1", 12)] }, positions, property);
  assert.deepEqual(lines.map((l) => l.verdict), ["over_plan", "over_plan"]);
});

test("звірка: рядок-заміна показує предмет, на який міняють, і звіряє заплановану позицію", () => {
  const replacement = { kind: "replacement" as const, id: "l1", positionId: "p2", qty: 3, kekv: "2210", newItem: { code: "ПМ-900", name: "Інша радіостанція", kekv: "2210", qty: 3, totalMinor: 300, measure: "шт." } };
  const [line] = planCheck({ lines: [replacement] }, positions, property).lines;
  assert.equal(line?.replacement, "Інша радіостанція");
  assert.equal(line?.verdict, "ok");
});

test("звірка: залишки ініціатора — скільки того, що просять, уже на базі й отримано (для заміни — нового предмета)", () => {
  const replacement = { kind: "replacement" as const, id: "r", positionId: "p2", qty: 1, kekv: "2210", newItem: { code: "ОБ-003", name: "Тепловізор", kekv: "3110", qty: 1, totalMinor: 100, measure: "шт." } };
  const check = planCheck({ lines: [by("a", "p1", 2), replacement, by("c", "p2", 1)] }, positions, property);
  assert.deepEqual(
    check.lines.map((l) => [l.lineId, l.onBase, l.received]),
    [
      ["a", 99, 0],
      ["r", 0, 8],
      ["c", 0, 0],
    ],
  );
  assert.equal(check.inStock, 2);
});
