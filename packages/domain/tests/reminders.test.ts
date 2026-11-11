import assert from "node:assert/strict";
import { test } from "node:test";
import { createManualClock, daysAtLevel, daysBetween, dailyReminders, toIsoDate } from "../src/index.ts";
import { all, apply, byList, createWorld, get, meta, preparer } from "./fixtures.ts";
import { advanceTo, formAt, submitted } from "./flow.ts";
import { returnRequest } from "../src/index.ts";

test("годинник: «Наступний день» зсуває дату, а домен читає лише його", () => {
  const clock = createManualClock("2027-01-31T23:00:00Z");
  assert.equal(toIsoDate(clock.now()), "2027-01-31");
  clock.advanceDays(1);
  assert.equal(toIsoDate(clock.now()), "2027-02-01");
  clock.set("2027-03-01T00:00:00Z");
  assert.equal(toIsoDate(clock.now()), "2027-03-01");
  assert.equal(daysBetween("2027-01-31", "2027-02-03"), 3);
});

test("лічильник днів на рівні росте з «Наступним днем» і скидається при переході", () => {
  const world = createWorld();
  const id = submitted(world, [byList("l1", "p1", 1)]);
  assert.equal(daysAtLevel(get(world, id), "2027-01-10"), 0);
  world.clock.advanceDays(3);
  assert.equal(daysAtLevel(get(world, id), "2027-01-13"), 3);
  advanceTo(world, [id], 2);
  assert.equal(get(world, id).levelEnteredOn, "2027-01-13");
});

test("нагадування: уповноваженому — за чергу, керівнику — за перелік, автору — за повернуту", () => {
  const world = createWorld();
  const queued = submitted(world, [byList("l1", "p1", 1)]);
  const listed = submitted(world, [byList("l1", "p2", 1)]);
  const returned = submitted(world, [byList("l1", "p3", 1)]);
  apply(world, returnRequest(world.ctx, meta(preparer(1)), { request: get(world, returned), note: "ні" }));
  formAt(world, 1, [listed]);
  world.clock.advanceDays(2);

  const reminders = dailyReminders(world.ctx, all(world));
  const by = (id: string) => reminders.find((n) => n.requestId === id);
  assert.deepEqual(by(queued)?.audience, { kind: "level", level: 1, unitId: "unit-vch", role: "preparer" });
  assert.deepEqual(by(listed)?.audience, { kind: "level", level: 1, unitId: "unit-vch", role: "approver" });
  assert.deepEqual(by(returned)?.audience, { kind: "author", userId: "u-author" });
  assert.equal(by(queued)?.note, "Днів на рівні: 2");
  assert.ok(reminders.every((n) => n.kind === "reminder" && n.at.startsWith("2027-01-12")));
});

test("нагадування не надходять за відкликаними та затвердженими заявками", () => {
  const world = createWorld();
  const id = submitted(world, [byList("l1", "p1", 1)]);
  advanceTo(world, [id], 5);
  formAt(world, 5, [id]);
  world.requests.set(id, { ...get(world, id), status: "withdrawn", level: null });
  assert.deepEqual(dailyReminders(world.ctx, all(world)), []);
});
