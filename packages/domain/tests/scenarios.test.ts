import assert from "node:assert/strict";
import { test } from "node:test";
import { editLines, issueExtracts, resubmit, returnRequest, withdraw } from "../src/index.ts";
import { all, apply, author, byList, createWorld, get, getList, meta, POSITIONS, preparer, replacement, system, UNIT_PLAN } from "./fixtures.ts";
import { advanceTo, approveAt, formAt, submitted } from "./flow.ts";
import { throwsCode } from "./helpers.ts";

// Сценарії документа розробки (E2, E3, E5, E6) на рівні домену.

test("E2: на рівні 1 обирають дві заявки з трьох, командир погоджує з номером СЕДО, третя лишається в черзі", () => {
  const world = createWorld();
  const ids = ["p1", "p2", "p1"].map((p) => submitted(world, [byList("l1", p, 1)])) as [string, string, string];
  const listId = formAt(world, 1, [ids[0], ids[1]]);
  approveAt(world, listId, 4242);
  assert.deepEqual(ids.map((id) => get(world, id).level), [2, 2, 1]);
  assert.equal(getList(world, listId).sedoNumber, 4242);
});

test("E3: повернення на рівні 3, автор виправляє й подає нову версію — вона йде з першого рівня", () => {
  const world = createWorld();
  const id = submitted(world, [byList("l1", "p1", 2)]);
  advanceTo(world, [id], 3);
  const returned = apply(world, returnRequest(world.ctx, meta(preparer(3)), { request: get(world, id), note: "Не та кількість" }));
  const recipients = returned.notifications.map((n) => (n.audience.kind === "author" ? "author" : n.audience.level));
  assert.deepEqual(recipients, [2, 1, "author"]);

  apply(world, editLines(world.ctx, meta(author), { request: get(world, id), lines: [byList("l1", "p1", 1)] }));
  apply(world, resubmit(world.ctx, meta(author), { request: get(world, id), positions: POSITIONS, unitPlan: UNIT_PLAN, budget: world.budget, requests: all(world), sedoNumber: 4102 }));
  const request = get(world, id);
  assert.equal(request.version, 2);
  assert.equal(request.level, 1);
  // Далі знову весь шлях: рівні 1 і 2 мають пройти заново.
  advanceTo(world, [id], 3);
  assert.equal(get(world, id).level, 3);
});

test("E5: відкликання на рівні 4 можливе, після затвердження — ні", () => {
  const world = createWorld();
  const withdrawn = submitted(world, [byList("l1", "p1", 1)]);
  const kept = submitted(world, [byList("l1", "p2", 1)]);
  advanceTo(world, [withdrawn, kept], 4);
  apply(world, withdraw(world.ctx, meta(author), { request: get(world, withdrawn) }));
  assert.equal(get(world, withdrawn).status, "withdrawn");

  // Друга заявка іде далі; після затвердження Головою її вже не відкликати.
  advanceTo(world, [kept], 5);
  approveAt(world, formAt(world, 5, [kept]), 77);
  throwsCode(() => withdraw(world.ctx, meta(author), { request: get(world, kept) }), "INVALID_TRANSITION");
});

test("E6: Голова затверджує — бюджет ще не списано, витяги по в/ч, «Заміна погоджена»", () => {
  const world = createWorld();
  const id = submitted(world, [byList("l1", "p2", 2), replacement("l2", "p1", 1, "3110", 90_00)]);
  advanceTo(world, [id], 5);
  approveAt(world, formAt(world, 5, [id]), 9001);
  assert.equal(world.budget.total.approvedMinor, 0, "бюджет списується лише після закупівлі");
  apply(world, issueExtracts(world.ctx, meta(system), { requests: [get(world, id)] }));
  assert.equal(get(world, id).status, "extract_issued");
  throwsCode(() => withdraw(world.ctx, meta(author), { request: get(world, id) }), "INVALID_TRANSITION");
});

test("журнал лише доповнюється: кожна дія залишає запис із ключем ідемпотентності", () => {
  const world = createWorld();
  const id = submitted(world, [byList("l1", "p1", 1)]);
  advanceTo(world, [id], 2);
  const before = [...world.events];
  apply(world, returnRequest(world.ctx, meta(preparer(2)), { request: get(world, id), note: "ні" }));
  assert.deepEqual(world.events.slice(0, before.length), before, "попередні записи не змінюються");
  assert.ok(world.events.length > before.length);
  assert.ok(world.events.every((e) => e.idempotencyKey.startsWith("key-") && e.actorId !== ""));
  const trail = world.events.filter((e) => e.requestId === id).map((e) => e.type);
  assert.deepEqual(trail, ["request.created", "request.submitted", "request.listed", "request.advanced", "request.returned"]);
});

test("стан не мутується: команди повертають нові об'єкти", () => {
  const world = createWorld();
  const id = submitted(world, [byList("l1", "p1", 1)]);
  const snapshot = structuredClone(get(world, id));
  const frozen = Object.freeze({ ...get(world, id) });
  returnRequest(world.ctx, meta(preparer(1)), { request: frozen, note: "ні" });
  assert.deepEqual(get(world, id), snapshot);
});
