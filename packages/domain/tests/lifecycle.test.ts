import assert from "node:assert/strict";
import { test } from "node:test";
import { createDraft, editLines, resubmit, returnRequest, submit, withdraw } from "../src/index.ts";
import { all, apply, approver, author, byList, createWorld, get, getList, meta, otherAuthor, POSITIONS, preparer, ROUTE } from "./fixtures.ts";
import { advanceTo, approveAt, formAt, submitted } from "./flow.ts";
import { throwsCode } from "./helpers.ts";

function draftOf(world: ReturnType<typeof createWorld>, lines = [byList("l1", "p1", 2)]): string {
  const [draft] = apply(world, createDraft(world.ctx, meta(author), { route: ROUTE, lines })).requests;
  return draft!.id;
}

const submitInput = (world: ReturnType<typeof createWorld>, id: string) => ({
  request: get(world, id),
  positions: POSITIONS,
  budget: world.budget,
  requests: all(world),
});

test("чернетка: створює лише автор своєї в/ч", () => {
  const world = createWorld();
  throwsCode(() => createDraft(world.ctx, meta(preparer(1)), { route: ROUTE, lines: [] }), "FORBIDDEN_ROLE");
  throwsCode(() => createDraft(world.ctx, meta({ userId: "x", role: { kind: "author", unitId: "інша-в/ч" } }), { route: ROUTE, lines: [] }), "FORBIDDEN_ROLE");
  const id = draftOf(world);
  const request = get(world, id);
  assert.equal(request.status, "draft");
  assert.equal(request.version, 1);
  assert.equal(request.level, null);
});

test("подати: чернетка стає заявкою в черзі рівня 1, пишеться журнал і сповіщення", () => {
  const world = createWorld();
  const id = draftOf(world);
  const outcome = apply(world, submit(world.ctx, meta(author), submitInput(world, id)));
  const request = get(world, id);
  assert.equal(request.status, "at_level");
  assert.equal(request.level, 1);
  assert.equal(request.levelEnteredOn, "2027-01-10");
  assert.equal(outcome.events[0]?.type, "request.submitted");
  assert.equal(outcome.events[0]?.from, "draft");
  assert.equal(outcome.events[0]?.to, "at_level");
  assert.deepEqual(outcome.notifications.map((n) => n.audience), [{ kind: "level", level: 1, unitId: "unit-vch", role: "preparer" }]);
});

test("подати: тільки автор, тільки чернетка, тільки непорожню й лише після автоперевірок", () => {
  const world = createWorld();
  const id = draftOf(world);
  throwsCode(() => submit(world.ctx, meta(otherAuthor), submitInput(world, id)), "FORBIDDEN_ROLE");
  throwsCode(() => submit(world.ctx, meta(preparer(1)), submitInput(world, id)), "FORBIDDEN_ROLE");

  const empty = draftOf(world, []);
  throwsCode(() => submit(world.ctx, meta(author), submitInput(world, empty)), "INVALID_TRANSITION");

  const bad = draftOf(world, [byList("l1", "p3", 9)]);
  const error = throwsCode(() => submit(world.ctx, meta(author), submitInput(world, bad)), "QTY_EXCEEDED");
  assert.ok(Array.isArray(error.details["issues"]));

  apply(world, submit(world.ctx, meta(author), submitInput(world, id)));
  throwsCode(() => submit(world.ctx, meta(author), submitInput(world, id)), "INVALID_TRANSITION");
});

test("VERSION_CONFLICT: застарілий номер версії запису відхиляється, актуальний проходить", () => {
  const world = createWorld();
  const id = draftOf(world);
  const request = get(world, id);
  throwsCode(() => submit(world.ctx, meta(author, { [id]: request.revision - 1 }), submitInput(world, id)), "VERSION_CONFLICT");
  submit(world.ctx, meta(author, { [id]: request.revision }), submitInput(world, id));
});

test("редагувати можна лише в чернетці й після повернення, і лише автору", () => {
  const world = createWorld();
  const id = draftOf(world);
  apply(world, editLines(world.ctx, meta(author), { request: get(world, id), lines: [byList("l1", "p1", 3)] }));
  assert.equal(get(world, id).lines[0]?.qty, 3);
  throwsCode(() => editLines(world.ctx, meta(otherAuthor), { request: get(world, id), lines: [] }), "FORBIDDEN_ROLE");
  apply(world, submit(world.ctx, meta(author), submitInput(world, id)));
  throwsCode(() => editLines(world.ctx, meta(author), { request: get(world, id), lines: [] }), "INVALID_TRANSITION");
});

test("повернення: заявка йде автору, примітка обов'язкова, каскад згори вниз", () => {
  const world = createWorld();
  const id = submitted(world, [byList("l1", "p1", 2)]);
  advanceTo(world, [id], 3); // тепер на рівні 3
  assert.equal(get(world, id).level, 3);

  throwsCode(() => returnRequest(world.ctx, meta(preparer(3)), { request: get(world, id), note: "   " }), "NOTE_REQUIRED");
  throwsCode(() => returnRequest(world.ctx, meta(preparer(2)), { request: get(world, id), note: "ні" }), "FORBIDDEN_ROLE");
  throwsCode(() => returnRequest(world.ctx, meta(approver(3)), { request: get(world, id), note: "ні" }), "FORBIDDEN_ROLE");

  const outcome = apply(world, returnRequest(world.ctx, meta(preparer(3)), { request: get(world, id), note: " Уточніть кількість " }));
  const request = get(world, id);
  assert.equal(request.status, "returned");
  assert.equal(request.level, null);
  assert.equal(request.returnInfo?.note, "Уточніть кількість");
  assert.equal(request.returnInfo?.level, 3);
  // Каскад: рівень 2, рівень 1, автор — саме в такому порядку.
  assert.deepEqual(outcome.notifications.map((n) => (n.audience.kind === "author" ? "author" : `L${n.audience.level}`)), ["L2", "L1", "author"]);
  assert.ok(outcome.notifications.every((n) => n.note === "Уточніть кількість" && n.kind === "request_returned"));
  assert.deepEqual(outcome.events[0]?.data["cascade"], ["L2", "L1", "author"]);
});

test("повернення з рівня 1: сповіщається лише автор", () => {
  const world = createWorld();
  const id = submitted(world, [byList("l1", "p1", 1)]);
  const outcome = apply(world, returnRequest(world.ctx, meta(preparer(1)), { request: get(world, id), note: "ні" }));
  assert.deepEqual(outcome.notifications.map((n) => n.audience.kind), ["author"]);
});

test("повернути можна лише заявку з черги; із сформованого переліку — спершу розформувати", () => {
  const world = createWorld();
  const id = submitted(world, [byList("l1", "p1", 1)]);
  formAt(world, 1, [id]);
  throwsCode(() => returnRequest(world.ctx, meta(preparer(1)), { request: get(world, id), note: "ні" }), "INVALID_TRANSITION");
});

test("нова версія після повернення: версія +1, маршрут з першого рівня, автоперевірки повторюються", () => {
  const world = createWorld();
  const id = submitted(world, [byList("l1", "p1", 2)]);
  advanceTo(world, [id], 3);
  apply(world, returnRequest(world.ctx, meta(preparer(3)), { request: get(world, id), note: "виправити" }));

  throwsCode(() => submit(world.ctx, meta(author), submitInput(world, id)), "INVALID_TRANSITION"); // submit — лише для чернетки
  throwsCode(() => resubmit(world.ctx, meta(otherAuthor), submitInput(world, id)), "FORBIDDEN_ROLE"); // виправляє лише автор

  apply(world, editLines(world.ctx, meta(author), { request: get(world, id), lines: [byList("l1", "p3", 9)] }));
  throwsCode(() => resubmit(world.ctx, meta(author), submitInput(world, id)), "QTY_EXCEEDED");

  apply(world, editLines(world.ctx, meta(author), { request: get(world, id), lines: [byList("l1", "p1", 1)] }));
  const outcome = apply(world, resubmit(world.ctx, meta(author), submitInput(world, id)));
  const request = get(world, id);
  assert.equal(request.version, 2);
  assert.equal(request.status, "at_level");
  assert.equal(request.level, 1);
  assert.equal(request.returnInfo, null);
  assert.equal(outcome.events[0]?.type, "request.resubmitted");
  assert.equal(outcome.events[0]?.requestVersion, 2);
});

test("відкликання: чернетка й повернута заявка", () => {
  const world = createWorld();
  const draft = draftOf(world);
  const outcome = apply(world, withdraw(world.ctx, meta(author), { request: get(world, draft) }));
  assert.equal(get(world, draft).status, "withdrawn");
  assert.deepEqual(outcome.notifications, []);

  const id = submitted(world, [byList("l1", "p1", 1)]);
  advanceTo(world, [id], 2);
  apply(world, returnRequest(world.ctx, meta(preparer(2)), { request: get(world, id), note: "ні" }));
  const second = apply(world, withdraw(world.ctx, meta(author), { request: get(world, id) }));
  assert.equal(get(world, id).status, "withdrawn");
  assert.deepEqual(second.notifications.map((n) => (n.audience.kind === "level" ? n.audience.level : 0)), [1, 2]);
});

test("відкликання на рівні 4: сповіщення рівням 1–4, де заявка була", () => {
  const world = createWorld();
  const id = submitted(world, [byList("l1", "p1", 1)]);
  advanceTo(world, [id], 4);
  const outcome = apply(world, withdraw(world.ctx, meta(author), { request: get(world, id) }));
  assert.equal(get(world, id).status, "withdrawn");
  assert.deepEqual(outcome.notifications.map((n) => (n.audience.kind === "level" ? n.audience.level : 0)), [1, 2, 3, 4]);
});

test("відкликання заявки у сформованому переліку розформовує перелік; інші заявки повертаються в чергу", () => {
  const world = createWorld();
  const a = submitted(world, [byList("l1", "p1", 1)]);
  const b = submitted(world, [byList("l1", "p2", 1)]);
  const listId = formAt(world, 1, [a, b]);
  const outcome = apply(
    world,
    withdraw(world.ctx, meta(author), { request: get(world, a), list: getList(world, listId), listRequests: [get(world, a), get(world, b)] }),
  );
  assert.equal(get(world, a).status, "withdrawn");
  assert.equal(get(world, b).status, "at_level");
  assert.equal(get(world, b).listId, null);
  assert.equal(getList(world, listId).status, "disbanded");
  assert.deepEqual(outcome.events.map((e) => e.type), ["list.disbanded", "request.delisted", "request.withdrawn"]);
});

test("відкликання з переліку без самого переліку або з чужим складом — відхиляється", () => {
  const world = createWorld();
  const a = submitted(world, [byList("l1", "p1", 1)]);
  const b = submitted(world, [byList("l1", "p2", 1)]);
  const listId = formAt(world, 1, [a, b]);
  throwsCode(() => withdraw(world.ctx, meta(author), { request: get(world, a) }), "INVALID_TRANSITION");
  throwsCode(
    () => withdraw(world.ctx, meta(author), { request: get(world, a), list: getList(world, listId), listRequests: [get(world, a)] }),
    "INVALID_TRANSITION",
  );
});

test("відкликати можна, поки заявку не затверджено на останньому рівні", () => {
  const world = createWorld();
  const id = submitted(world, [byList("l1", "p1", 1)]);
  advanceTo(world, [id], 5);
  approveAt(world, formAt(world, 5, [id]), 5000);
  assert.equal(get(world, id).status, "approved");
  throwsCode(() => withdraw(world.ctx, meta(author), { request: get(world, id) }), "INVALID_TRANSITION");
  throwsCode(() => withdraw(world.ctx, meta(otherAuthor), { request: get(world, id) }), "FORBIDDEN_ROLE");
});

test("відкликана заявка вдруге не відкликається", () => {
  const world = createWorld();
  const id = draftOf(world);
  apply(world, withdraw(world.ctx, meta(author), { request: get(world, id) }));
  throwsCode(() => withdraw(world.ctx, meta(author), { request: get(world, id) }), "INVALID_TRANSITION");
});

test("дублікат id рядків відхиляється при створенні й редагуванні, нічого не змінюючи", () => {
  const world = createWorld();
  const twice = [byList("same", "p1", 1), byList("same", "p2", 1)];
  const error = throwsCode(() => createDraft(world.ctx, meta(author), { route: ROUTE, lines: twice }), "INVALID_TRANSITION");
  assert.equal(error.details["reason"], "DUPLICATE_LINE_ID");
  assert.equal(error.details["lineId"], "same");

  const id = draftOf(world);
  const before = get(world, id);
  throwsCode(() => editLines(world.ctx, meta(author), { request: before, lines: twice }), "INVALID_TRANSITION");
  assert.equal(get(world, id), before, "заявка не змінилась");
  apply(world, editLines(world.ctx, meta(author), { request: before, lines: [byList("a", "p1", 1), byList("b", "p1", 1)] }));
  assert.equal(get(world, id).lines.length, 2, "різні id приймаються, навіть для однієї позиції");
});
