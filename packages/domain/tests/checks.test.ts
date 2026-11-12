import assert from "node:assert/strict";
import { test } from "node:test";
import { checkRequest, parseSedoNumber, type Request } from "../src/index.ts";
import { all, BUDGET, byList, createWorld, POSITIONS, UNIT_PLAN, ROUTE } from "./fixtures.ts";
import { submitted } from "./flow.ts";
import { throwsCode } from "./helpers.ts";

const base = { positions: POSITIONS, unitPlan: UNIT_PLAN, unitId: ROUTE[0], budget: BUDGET, requests: [] as Request[] };

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
  const report = checkRequest({ ...base, unitId: "інша-в/ч", requests: all(world), lines: [byList("l2", "p1", 3)] }); // 300 ≤ 600, але 700 > 600 (інша в/ч: позиція не зайнята)
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

test("план в/ч: позиції немає в плані підрозділу — NOT_IN_LIST, хоча в переліку напрямку вона є", () => {
  const { p3: _omitted, ...plan } = UNIT_PLAN;
  const report = checkRequest({ ...base, unitPlan: plan, lines: [byList("l1", "p3", 1), byList("l2", "p1", 1)] });
  assert.equal(report.ok, false);
  assert.equal(report.errors.length, 1);
  const [issue] = report.errors;
  assert.equal(issue?.code, "NOT_IN_LIST");
  assert.equal(issue?.lineId, "l1");
  assert.equal(issue?.details["reason"], "NOT_IN_UNIT_PLAN");
});

test("план в/ч: кількість більша за заплановану в підрозділі — QTY_EXCEEDED, навіть якщо за переліком напрямку її вистачає", () => {
  const report = checkRequest({ ...base, unitPlan: { ...UNIT_PLAN, p1: 2 }, lines: [byList("l1", "p1", 3)] }); // за переліком доступно 10
  assert.equal(report.ok, false);
  const [issue] = report.errors;
  assert.equal(issue?.code, "QTY_EXCEEDED");
  assert.deepEqual([issue?.details["reason"], issue?.details["requested"], issue?.details["available"]], ["UNIT_PLAN_EXCEEDED", 3, 2]);
});

test("план в/ч: у межах плану, але більше за доступне за переліком напрямку — теж помилка (діє менша межа)", () => {
  const report = checkRequest({ ...base, lines: [byList("l1", "p3", 4)] }); // план 30, доступно 3
  assert.equal(report.errors[0]?.code, "QTY_EXCEEDED");
  assert.equal(report.errors[0]?.details["available"], 3);
});

test("план в/ч: кількість однієї позиції в кількох рядках підсумовується з планом", () => {
  const report = checkRequest({ ...base, unitPlan: { ...UNIT_PLAN, p1: 3 }, lines: [byList("l1", "p1", 2), byList("l2", "p1", 2)] });
  // Накопичувальна сума, як і для переліку напрямку: перший рядок (2 з 3) проходить, другий (разом 4) — ні.
  assert.deepEqual(report.errors.map((e) => [e.lineId, e.details["reason"]]), [["l2", "UNIT_PLAN_EXCEEDED"]]);
});

test("план в/ч рахується разом з іншими заявками в/ч: замовлене раніше зменшує залишок плану", () => {
  const world = createWorld();
  submitted(world, [byList("l1", "p1", 3)]); // в/ч уже замовила 3 з плану 5
  const report = checkRequest({ ...base, unitPlan: { ...UNIT_PLAN, p1: 5 }, requests: all(world), lines: [byList("l9", "p2", 1)] });
  assert.equal(report.ok, true);
  const over = checkRequest({ ...base, unitPlan: { ...UNIT_PLAN, p1: 5, p3: 30 }, requests: all(world).map((r) => ({ ...r, status: "approved" as const })), lines: [byList("l9", "p1", 3)] });
  const issue = over.errors.find((e) => e.code === "QTY_EXCEEDED");
  assert.deepEqual([issue?.details["available"], issue?.details["alreadyOrdered"]], [2, 3]);
});

test("позиція в іншій незавершеній заявці в/ч — POSITION_BUSY; у чернетці чи відкликаній — ні", () => {
  const world = createWorld();
  const id = submitted(world, [byList("l1", "p1", 1)]);
  const busy = checkRequest({ ...base, requests: all(world), lines: [byList("l9", "p1", 1)] });
  assert.equal(busy.errors[0]?.code, "POSITION_BUSY");
  assert.equal(busy.errors[0]?.details["requestId"], id);
  // Інша в/ч — не заважає; сама заявка (перевірка під час редагування) — теж.
  assert.equal(checkRequest({ ...base, unitId: "інша-в/ч", requests: all(world), lines: [byList("l9", "p1", 1)] }).errors.length, 0);
  assert.equal(checkRequest({ ...base, requests: all(world), requestId: id, lines: [byList("l1", "p1", 1)] }).errors.length, 0);
});

test("закупівля позиції вже почалась — попередження, але подати можна", () => {
  const world = createWorld();
  submitted(world, [byList("l1", "p2", 1)]);
  const approvedReqs = all(world).map((r) => ({ ...r, status: "extract_issued" as const }));
  const report = checkRequest({ ...base, requests: approvedReqs, lines: [byList("l9", "p2", 1)] });
  assert.equal(report.ok, true);
  assert.equal(report.warnings[0]?.details["reason"], "PURCHASE_STARTED");
});
