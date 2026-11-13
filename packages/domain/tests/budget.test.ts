import assert from "node:assert/strict";
import { test } from "node:test";
import { lineEffect, requestImpact, reserve, evaluateBudget } from "../src/index.ts";
import { BUDGET, byList, POSITIONS, replacement } from "./fixtures.ts";

const p1 = POSITIONS["p1"]!;

test("рядок за переліком витрачає ціну × кількість у КЕКВ позиції", () => {
  assert.deepEqual(lineEffect(byList("l", "p1", 3), p1), { "2210": 300_00 });
});

test("заміна в межах одного КЕКВ ліміт не витрачає, навіть якщо ціни різні", () => {
  assert.deepEqual(lineEffect(replacement("l", "p1", 2, "2210", 130_00), p1), {});
  const impact = requestImpact([replacement("l", "p1", 2, "2210", 130_00)], POSITIONS);
  assert.equal(impact.total, 0);
});

test("заміна на інший КЕКВ списує суму нового предмета; старий КЕКВ не змінюється", () => {
  assert.deepEqual(lineEffect(replacement("l", "p1", 2, "3110", 150_00, 1), p1), { "3110": 150_00 });
  const impact = requestImpact([replacement("l", "p1", 2, "3110", 150_00, 1)], POSITIONS);
  assert.deepEqual(impact.perKekv, { "3110": 150_00 });
  assert.equal(impact.total, 150_00, "загальна витрата — вся сума нового предмета, без вирахування старого");
});

test("жоден рядок не дає від'ємної зміни бюджету: вивільнення не передбачено", () => {
  const lines = [byList("a", "p1", 2), replacement("b", "p1", 3, "3110", 10_00), replacement("c", "p1", 1, "2210", 40_00)];
  const impact = requestImpact(lines, POSITIONS);
  assert.ok(Object.values(impact.perKekv).every((amount) => amount >= 0));
  assert.ok(impact.total >= 0);
});

test("заміна на інший КЕКВ перевіряється за лімітом нового КЕКВ", () => {
  const impact = requestImpact([replacement("l", "p1", 4, "3110", 400_00, 2)], POSITIONS); // 400 > 300 у 3110
  const tight = { ...BUDGET, perKekv: { ...BUDGET.perKekv, "3110": { limitMinor: 300_00, approvedMinor: 0 } } };
  const result = evaluateBudget(tight, impact);
  assert.deepEqual(result.errors.map((e) => e.scope), ["3110"]);
});

test("нульова зміна не створює помилок бюджету", () => {
  assert.deepEqual(evaluateBudget(BUDGET, { perKekv: { "2210": 0 }, total: 0 }), { errors: [], warnings: [] });
});

test("резерв збільшує затверджену суму по КЕКВ і загалом, не змінюючи ліміти", () => {
  const impact = requestImpact([byList("a", "p1", 2), byList("b", "p3", 1)], POSITIONS);
  const next = reserve(BUDGET, impact);
  assert.equal(next.total.approvedMinor, 400_00);
  assert.equal(next.perKekv["2210"]?.approvedMinor, 200_00);
  assert.equal(next.perKekv["3110"]?.approvedMinor, 200_00);
  assert.equal(next.total.limitMinor, BUDGET.total.limitMinor);
  assert.equal(BUDGET.total.approvedMinor, 0, "вихідний бюджет не змінюється");
});

test("позиції поза переліком не впливають на бюджет (їх відсікають автоперевірки)", () => {
  assert.equal(requestImpact([byList("x", "nope", 5, "2210")], POSITIONS).total, 0);
});
