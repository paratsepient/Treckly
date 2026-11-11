import assert from "node:assert/strict";
import { test } from "node:test";
import { checkRequest, parseSedoNumber } from "../src/index.ts";
import { all, BUDGET, byList, createWorld, POSITIONS } from "./fixtures.ts";
import { submitted } from "./flow.ts";
import { throwsCode } from "./helpers.ts";

const base = { positions: POSITIONS, budget: BUDGET, requests: [] };

test("автоперевірки: коректна заявка проходить без помилок і попереджень", () => {
  const report = checkRequest({ ...base, lines: [byList("l1", "p1", 2), byList("l2", "p3", 1)] });
  assert.equal(report.ok, true);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.warnings, []);
  assert.equal(report.impact.total, 2 * 100_00 + 200_00);
});

test("NOT_IN_LIST: позиції немає в переліку напрямку", () => {
  const report = checkRequest({ ...base, lines: [byList("l1", "p-unknown", 1, "2210")] });
  assert.equal(report.ok, false);
  assert.equal(report.errors[0]?.code, "NOT_IN_LIST");
  assert.equal(report.errors[0]?.lineId, "l1");
});

test("QTY_EXCEEDED: кількість більша за доступну", () => {
  const report = checkRequest({ ...base, lines: [byList("l1", "p3", 4)] });
  assert.equal(report.errors[0]?.code, "QTY_EXCEEDED");
  assert.deepEqual(report.errors[0]?.details, { positionId: "p3", requested: 4, available: 3 });
});

test("QTY_EXCEEDED: кількості одного предмета в різних рядках додаються", () => {
  const report = checkRequest({ ...base, lines: [byList("l1", "p3", 2), byList("l2", "p3", 2)] });
  assert.equal(report.errors.filter((e) => e.code === "QTY_EXCEEDED").length, 1);
  assert.equal(report.errors.find((e) => e.code === "QTY_EXCEEDED")?.lineId, "l2");
});

test("QTY_EXCEEDED: нуль, від'ємна й дробова кількість не приймаються", () => {
  for (const qty of [0, -1, 1.5]) {
    const report = checkRequest({ ...base, lines: [byList("l1", "p1", qty)] });
    assert.equal(report.errors[0]?.code, "QTY_EXCEEDED", `qty=${qty}`);
  }
});

test("KEKV_MISMATCH: КЕКВ рядка не збігається з КЕКВ позиції", () => {
  const report = checkRequest({ ...base, lines: [byList("l1", "p1", 1, "3110")] });
  assert.equal(report.errors[0]?.code, "KEKV_MISMATCH");
  assert.deepEqual(report.errors[0]?.details, { lineKekv: "3110", positionKekv: "2210" });
});

test("BUDGET_EXCEEDED: сума перевищує залишок КЕКВ — блокування", () => {
  const report = checkRequest({ ...base, lines: [byList("l1", "p1", 7)] }); // 700 > 600
  assert.equal(report.ok, false);
  const issue = report.errors.find((e) => e.code === "BUDGET_EXCEEDED");
  assert.equal(issue?.details["scope"], "2210");
  assert.equal(issue?.details["remainingMinor"], 600_00);
});

test("BUDGET_EXCEEDED: перевищення загального бюджету теж блокує", () => {
  const budget = { ...BUDGET, total: { limitMinor: 150_00, approvedMinor: 0 } };
  const report = checkRequest({ ...base, budget, lines: [byList("l1", "p1", 2)] }); // 200 > 150, КЕКВ 600 ок
  assert.deepEqual(report.errors.map((e) => e.details["scope"]), ["TOTAL"]);
});

test("залишок рахується від затвердженого резерву, а не від ліміту", () => {
  const budget = { ...BUDGET, perKekv: { ...BUDGET.perKekv, "2210": { limitMinor: 600_00, approvedMinor: 500_00 } } };
  assert.equal(checkRequest({ ...base, budget, lines: [byList("l1", "p1", 1)] }).ok, true);
  assert.equal(checkRequest({ ...base, budget, lines: [byList("l1", "p1", 2)] }).ok, false);
});

test("попередження: разом із заявками «у роботі» сума перевищує залишок, але подання не блокується", () => {
  const world = createWorld();
  submitted(world, [byList("l1", "p1", 4)]); // 400 у роботі
  const report = checkRequest({ ...base, requests: all(world), lines: [byList("l2", "p1", 3)] }); // 300 ≤ 600, але 700 > 600
  assert.equal(report.ok, true);
  assert.equal(report.warnings.length, 1);
  assert.equal(report.warnings[0]?.details["inWorkMinor"], 400_00);
});

test("«у роботі» не враховує власну заявку, чернетки й затверджені заявки", () => {
  const world = createWorld();
  const id = submitted(world, [byList("l1", "p1", 4)]);
  const own = checkRequest({ ...base, requests: all(world), requestId: id, lines: [byList("l1", "p1", 4)] });
  assert.deepEqual(own.warnings, []);
  assert.equal(own.inWork.total, 0);
});

test("СЕДО: приймає лише числа", () => {
  assert.equal(parseSedoNumber("12345"), 12345);
  assert.equal(parseSedoNumber(77), 77);
  assert.equal(parseSedoNumber(" 42 "), 42);
  for (const bad of ["", "  ", "12a", "12-34", "0", "-5", "1.5", "1 000", "9".repeat(16), null, undefined]) {
    throwsCode(() => parseSedoNumber(bad), "SEDO_NUMBER_INVALID");
  }
});
