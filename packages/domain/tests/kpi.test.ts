import assert from "node:assert/strict";
import { test } from "node:test";
import { computeKpi, returnRequest, withdraw } from "../src/index.ts";
import { all, apply, author, byList, createWorld, get, meta, preparer } from "./fixtures.ts";
import { advanceTo, approveAt, formAt, submitted } from "./flow.ts";

const kpi = (world: ReturnType<typeof createWorld>) => computeKpi(all(world), world.events, world.clock.now().toISOString().slice(0, 10));

test("KPI порожньої системи: усі статуси присутні з нулями, дні й частка повернень — нулі", () => {
  const k = computeKpi([], [], "2027-01-10");
  assert.deepEqual(Object.values(k.byStatus), [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(Object.keys(k.byStatus).length, 10);
  assert.deepEqual(k.avgDaysByLevel, { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 });
  assert.equal(k.returnShare, 0);
});

test("KPI: заявки рахуються за статусами", () => {
  const world = createWorld();
  const ids = [1, 2, 3, 4].map(() => submitted(world, [byList("l", "p1", 1)])) as string[];
  advanceTo(world, [ids[0]!], 5);
  approveAt(world, formAt(world, 5, [ids[0]!]), 9);
  apply(world, withdraw(world.ctx, meta(author), { request: get(world, ids[1]!) }));
  const k = kpi(world);
  assert.equal(k.byStatus.approved, 1);
  assert.equal(k.byStatus.withdrawn, 1);
  assert.equal(k.byStatus.at_level, 2);
  assert.equal(Object.values(k.byStatus).reduce((a, b) => a + b, 0), 4);
});

test("KPI: середні дні на рівні — пройдені й поточний рівні; рівні без даних — 0", () => {
  const world = createWorld(); // 10.01
  const a = submitted(world, [byList("l", "p1", 1)]);
  const b = submitted(world, [byList("l", "p1", 1)]);
  approveAt(world, formAt(world, 1, [a, b]), 1); // обидві з 10.01 на рівні 2
  world.clock.advanceDays(4);
  approveAt(world, formAt(world, 2, [a]), 2); // a: рівень 2 пробула 4 дні; на рівні 3 з 14.01
  world.clock.advanceDays(2); // сьогодні 16.01
  const k = kpi(world);
  assert.equal(k.avgDaysByLevel["1"], 0, "рівень 1 погоджено того ж дня");
  assert.equal(k.avgDaysByLevel["2"], 5, "a: 4 дні (пройдено), b: 6 днів (ще на рівні): середнє 5");
  assert.equal(k.avgDaysByLevel["3"], 2, "a на рівні 3 уже 2 дні");
  assert.equal(k.avgDaysByLevel["4"], 0);
  assert.equal(k.avgDaysByLevel["5"], 0);
});

test("KPI: частка повернень — заявки, які хоч раз повертали, серед поданих", () => {
  const world = createWorld();
  const ids = [1, 2, 3, 4].map(() => submitted(world, [byList("l", "p1", 1)])) as string[];
  apply(world, returnRequest(world.ctx, meta(preparer(1)), { request: get(world, ids[0]!), note: "ні" }));
  assert.equal(kpi(world).returnShare, 0.25);
  apply(world, returnRequest(world.ctx, meta(preparer(1)), { request: get(world, ids[1]!), note: "ні" }));
  assert.equal(kpi(world).returnShare, 0.5);
});

test("KPI: чернетки не рахуються серед поданих", () => {
  const world = createWorld();
  submitted(world, [byList("l", "p1", 1)]);
  const k = kpi(world);
  assert.equal(k.returnShare, 0);
});
