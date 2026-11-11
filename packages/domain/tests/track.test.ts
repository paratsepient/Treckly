import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTrack, editLines, resubmit, returnRequest, withdraw, type Track } from "../src/index.ts";
import { all, apply, author, byList, createWorld, get, meta, POSITIONS, preparer } from "./fixtures.ts";
import { advanceTo, approveAt, formAt, submitted } from "./flow.ts";

const states = (track: Track) => track.map((s) => s.state);
const trackOf = (world: ReturnType<typeof createWorld>, id: string) => buildTrack(get(world, id), world.events, world.clock.now().toISOString().slice(0, 10));

test("трек чернетки: усі рівні попереду", () => {
  const world = createWorld();
  const id = submitted(world, [byList("l1", "p1", 1)]);
  world.requests.set(id, { ...get(world, id), status: "draft", level: null });
  assert.deepEqual(states(trackOf(world, id)), ["pending", "pending", "pending", "pending", "pending"]);
});

test("трек заявки на рівні 3: два рівні пройдено з номерами СЕДО, третій поточний із лічильником днів", () => {
  const world = createWorld(); // 2027-01-10
  const id = submitted(world, [byList("l1", "p1", 1)]);
  advanceTo(world, [id], 3); // рівні 1 і 2 погоджено 10-го і 11-го; на рівень 3 заявка прийшла 11-го
  world.clock.advanceDays(4); // advanceTo лишив 12-те, тепер сьогодні 2027-01-16
  const track = trackOf(world, id);
  assert.deepEqual(states(track), ["done", "done", "current", "pending", "pending"]);
  assert.deepEqual(track.map((s) => s.enteredOn), ["2027-01-10", "2027-01-10", "2027-01-11", null, null]);
  assert.deepEqual(track.map((s) => s.daysAtLevel), [0, 1, 5, null, null]);
  assert.deepEqual(track.map((s) => s.sedoNumber), [2001, 2002, null, null, null]);
  assert.equal(track[2]?.inList, false);
});

test("заявка в сформованому переліку: позначка «у переліку» на поточному рівні", () => {
  const world = createWorld();
  const id = submitted(world, [byList("l1", "p1", 1)]);
  formAt(world, 1, [id]);
  const track = trackOf(world, id);
  assert.equal(track[0]?.state, "current");
  assert.equal(track[0]?.inList, true);
  assert.equal(track[1]?.inList, false);
});

test("повернення показане каскадом: рівні від 1 до того, що повернув, позначені «повернуто»", () => {
  const world = createWorld();
  const id = submitted(world, [byList("l1", "p1", 1)]);
  advanceTo(world, [id], 3);
  apply(world, returnRequest(world.ctx, meta(preparer(3)), { request: get(world, id), note: "ні" }));
  const track = trackOf(world, id);
  assert.deepEqual(states(track), ["returned", "returned", "returned", "pending", "pending"]);
  assert.equal(track[2]?.daysAtLevel, 1, "рівень 3 тримав заявку добу до повернення");
});

test("нова версія: трек починається знову з першого рівня й не змішується з попередньою версією", () => {
  const world = createWorld();
  const id = submitted(world, [byList("l1", "p1", 1)]);
  advanceTo(world, [id], 3);
  apply(world, returnRequest(world.ctx, meta(preparer(3)), { request: get(world, id), note: "ні" }));
  apply(world, editLines(world.ctx, meta(author), { request: get(world, id), lines: [byList("l1", "p1", 2)] }));
  world.clock.advanceDays(2);
  apply(world, resubmit(world.ctx, meta(author), { request: get(world, id), positions: POSITIONS, budget: world.budget, requests: all(world) }));
  const track = trackOf(world, id);
  assert.equal(get(world, id).version, 2);
  assert.deepEqual(states(track), ["current", "pending", "pending", "pending", "pending"]);
  assert.deepEqual(track.map((s) => s.sedoNumber), [null, null, null, null, null], "СЕДО першої версії не показується");
  assert.equal(track[0]?.enteredOn, world.clock.now().toISOString().slice(0, 10));
});

test("затверджена заявка: усі рівні пройдені, СЕДО є на кожному, включно з п'ятим", () => {
  const world = createWorld();
  const id = submitted(world, [byList("l1", "p1", 1)]);
  advanceTo(world, [id], 5);
  approveAt(world, formAt(world, 5, [id]), 9999);
  const track = trackOf(world, id);
  assert.deepEqual(states(track), ["done", "done", "done", "done", "done"]);
  assert.deepEqual(track.map((s) => s.sedoNumber), [2001, 2002, 2003, 2004, 9999]);
  assert.ok(track.every((s) => s.daysAtLevel !== null));
});

test("відкликана на рівні 4: пройдені рівні 1–4, п'ятий попереду", () => {
  const world = createWorld();
  const id = submitted(world, [byList("l1", "p1", 1)]);
  advanceTo(world, [id], 4);
  apply(world, withdraw(world.ctx, meta(author), { request: get(world, id) }));
  assert.deepEqual(states(trackOf(world, id)), ["done", "done", "done", "done", "pending"]);
});
