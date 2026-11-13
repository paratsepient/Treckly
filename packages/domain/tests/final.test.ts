import assert from "node:assert/strict";
import { test } from "node:test";
import { approveList, issueExtracts, lineStatus, markNotSigned } from "../src/index.ts";
import { all, apply, approver, author, byList, createWorld, get, getList, meta, POSITIONS, replacement, system, preparer } from "./fixtures.ts";
import { advanceTo, approveAt, formAt, submitted } from "./flow.ts";
import { throwsCode } from "./helpers.ts";

function atFinal(lines: Parameters<typeof submitted>[1][]) {
  const world = createWorld();
  const ids = lines.map((l) => submitted(world, l));
  advanceTo(world, ids, 5);
  return { world, ids };
}

test("Голова затверджує: заявка затверджена, бюджет не списується (лише після закупівлі), план без замін не змінюється", () => {
  const { world, ids } = atFinal([[byList("l1", "p1", 2), byList("l2", "p3", 1)]]);
  const outcome = approveAt(world, formAt(world, 5, ids), 5001);
  const request = get(world, ids[0]!);
  assert.equal(request.status, "approved");
  assert.equal(request.level, 5);
  assert.equal(world.budget.total.approvedMinor, 0);
  assert.equal(outcome.budget, undefined);
  assert.deepEqual(outcome.catalog, []);
  assert.deepEqual(outcome.property, []);
  assert.equal(outcome.events.some((e) => e.type === "request.approved"), true);
  assert.ok(outcome.notifications.some((n) => n.audience.kind === "author"));
});

test("на проміжних рівнях бюджет не резервується", () => {
  const world = createWorld();
  const id = submitted(world, [byList("l1", "p1", 2)]);
  advanceTo(world, [id], 4);
  assert.equal(world.budget.total.approvedMinor, 0);
});

test("затвердження блокується, якщо сума переліку перевищує залишок: нічого не змінюється", () => {
  const { world, ids } = atFinal([[byList("l1", "p1", 3)], [byList("l1", "p1", 3)], [byList("l1", "p1", 3)]]); // 3×300 у КЕКВ 2210 (ліміт 600)
  const listId = formAt(world, 5, ids);
  const list = getList(world, listId);
  const error = throwsCode(
    () => approveList(world.ctx, meta(preparer(5)), { list, requests: ids.map((id) => get(world, id)), sedoNumber: 1, positions: POSITIONS, budget: world.budget, allRequests: all(world) }),
    "BUDGET_EXCEEDED",
  );
  assert.equal(error.details["scope"], "2210");
  assert.equal(getList(world, listId).status, "formed");
  assert.equal(world.budget.total.approvedMinor, 0);
});

test("ліміт для наступного переліку враховує погоджені, ще не закуплені зміни", () => {
  const { world, ids } = atFinal([[byList("l1", "p1", 4)], [byList("l1", "p1", 3)]]); // 400 + 300 > 600
  const [first, second] = ids as [string, string];
  approveAt(world, formAt(world, 5, [first]), 1);
  assert.equal(world.budget.perKekv["2210"]?.approvedMinor, 0, "бюджет ще не списано — закупівлі не було");
  world.clock.advanceDays(1);
  const listId = formAt(world, 5, [second]);
  throwsCode(
    () =>
      approveList(world.ctx, meta(preparer(5)), { list: getList(world, listId), requests: [get(world, second)], sedoNumber: 2, positions: POSITIONS, budget: world.budget, allRequests: all(world) }),
    "BUDGET_EXCEEDED",
  );
});

test("підпис Голови змінює план в/ч: замінене зникає з плану, новий предмет додається («Погоджені зміни»)", () => {
  const { world, ids } = atFinal([[replacement("l1", "p1", 3, "2210", 140_00, 2)]]);
  const outcome = approveAt(world, formAt(world, 5, ids), 7);
  const line = get(world, ids[0]!).lines[0]!;
  assert.equal(line.kind, "replacement");
  if (line.kind !== "replacement") return;
  assert.ok(line.newItem.code !== "" && line.newPositionId, "новий предмет отримав код і позицію переліку");
  assert.deepEqual(outcome.catalog?.map((c) => [c.code, c.name, c.kekv, c.priceMinor]), [[line.newItem.code, "Новий предмет", "2210", 70_00]]);
  assert.deepEqual(outcome.property?.map((p) => [p.code, p.tab, p.delta]), [
    ["A-001", "planned", -3],
    [line.newItem.code, "planned", 2],
  ]);
  assert.equal(world.budget.total.approvedMinor, 0, "бюджет не списується при погодженні");
});

test("заміна дорожча за замінене не проходить автоперевірки", () => {
  const world = createWorld();
  assert.throws(() => submitted(world, [replacement("l1", "p1", 2, "3110", 250_00)]), (e: Error & { code?: string }) => e.code === "REPLACEMENT_OVER_SUM");
});

test("«Заміна погоджена» лише після витягу; до того рядок заміни очікує", () => {
  const { world, ids } = atFinal([[byList("l1", "p2", 1), replacement("l2", "p1", 1, "2210", 90_00)]]);
  approveAt(world, formAt(world, 5, ids), 9);
  const approved = get(world, ids[0]!);
  assert.deepEqual(approved.lines.map((l) => lineStatus(approved, l)), ["approved", "awaits_replacement_approval"]);

  const outcome = apply(world, issueExtracts(world.ctx, meta(system), { requests: [approved] }));
  const issued = get(world, ids[0]!);
  assert.equal(issued.status, "extract_issued");
  assert.deepEqual(issued.lines.map((l) => lineStatus(issued, l)), ["approved", "replacement_agreed"]);
  assert.deepEqual(outcome.extracts?.[0]?.lines.map((l) => l.status), ["approved", "replacement_agreed"]);
});

test("витяги формуються по в/ч, лише системою і лише для затверджених заявок", () => {
  const { world, ids } = atFinal([[byList("l1", "p1", 1)], [byList("l1", "p2", 1)]]);
  const [a, b] = ids as [string, string];
  throwsCode(() => issueExtracts(world.ctx, meta(system), { requests: [get(world, a)] }), "INVALID_TRANSITION");
  approveAt(world, formAt(world, 5, [a, b]), 10);
  throwsCode(() => issueExtracts(world.ctx, meta(author), { requests: [get(world, a)] }), "FORBIDDEN_ROLE");
  throwsCode(() => issueExtracts(world.ctx, meta(preparer(5)), { requests: [get(world, a)] }), "FORBIDDEN_ROLE");
  const outcome = apply(world, issueExtracts(world.ctx, meta(system), { requests: [get(world, a), get(world, b)] }));
  assert.equal(outcome.extracts?.length, 1, "обидві заявки з однієї в/ч — один витяг");
  assert.equal(outcome.extracts?.[0]?.unitId, "unit-vch");
  assert.deepEqual(outcome.extracts?.[0]?.requestIds, [a, b]);
  assert.ok(outcome.notifications.every((n) => n.kind === "extract_issued"));
  throwsCode(() => issueExtracts(world.ctx, meta(system), { requests: [get(world, a)] }), "INVALID_TRANSITION"); // вдруге не можна
});

test("рівень 5: підпис Голови відмічає Відділ оборонних ресурсів; сам Голова в системі не погоджує", () => {
  const { world, ids } = atFinal([[byList("l1", "p1", 1)]]);
  const listId = formAt(world, 5, ids);
  const input = () => ({ list: getList(world, listId), requests: ids.map((id) => get(world, id)), sedoNumber: 77, positions: POSITIONS, budget: world.budget });
  throwsCode(() => approveList(world.ctx, meta(approver(5)), input()), "FORBIDDEN_ROLE");
  const outcome = apply(world, approveList(world.ctx, meta(preparer(5)), input()));
  assert.equal(outcome.lists[0]?.status, "approved");
  assert.equal(outcome.lists[0]?.approvedBy, preparer(5).userId);
  assert.ok(ids.every((id) => get(world, id).status === "approved"));
});

test("Голова не підписав: усі заявки переліку повертаються авторам із приміткою, бюджет не змінюється", () => {
  const { world, ids } = atFinal([[byList("l1", "p1", 1)], [byList("l1", "p2", 1)]]);
  const listId = formAt(world, 5, ids);
  const list = getList(world, listId);
  const requests = ids.map((id) => get(world, id));
  const reserved = world.budget.total.approvedMinor;
  throwsCode(() => markNotSigned(world.ctx, meta(preparer(5)), { list, requests, note: "  " }), "NOTE_REQUIRED");
  throwsCode(() => markNotSigned(world.ctx, meta(approver(4)), { list, requests, note: "Перевищено" }), "FORBIDDEN_ROLE");
  const outcome = apply(world, markNotSigned(world.ctx, meta(preparer(5)), { list, requests, note: "Перевищено ліміт напрямку" }));
  assert.equal(getList(world, listId).status, "not_signed");
  for (const id of ids) {
    const r = get(world, id);
    assert.equal(r.status, "returned");
    assert.equal(r.returnInfo?.level, 5);
    assert.match(r.returnInfo?.note ?? "", /^Голова не підписав перелік: Перевищено ліміт напрямку/);
    assert.equal(r.returnInfo?.reason, "not_signed");
  }
  assert.equal(world.budget.total.approvedMinor, reserved);
  // Кожна заявка: рівні 4…1 і автор.
  assert.equal(outcome.notifications.length, ids.length * 5);
  assert.ok(outcome.events.some((e) => e.type === "list.not_signed"));
});

test("«Голова не підписав» — лише для переліку рівня 5", () => {
  const world = createWorld();
  const id = submitted(world, [byList("l1", "p1", 1)]);
  const listId = formAt(world, 1, [id]);
  throwsCode(() => markNotSigned(world.ctx, meta(preparer(1)), { list: getList(world, listId), requests: [get(world, id)], note: "Ні" }), "INVALID_TRANSITION");
});
