import assert from "node:assert/strict";
import { test } from "node:test";
import { closeNotProcured, confirmProcurement, issueExtracts, issueProcured, lineStatus } from "../src/index.ts";
import { admin, apply, author, byList, createWorld, get, meta, POSITIONS, preparer, replacement, system } from "./fixtures.ts";
import { advanceTo, approveAt, formAt, submitted } from "./flow.ts";
import { throwsCode } from "./helpers.ts";

/** Заявка, затверджена Головою, з витягом: звідси починається закупівля. */
function withExtract(lines: Parameters<typeof submitted>[1]) {
  const world = createWorld();
  const id = submitted(world, lines);
  advanceTo(world, [id], 5);
  approveAt(world, formAt(world, 5, [id]), 5001);
  apply(world, issueExtracts(world.ctx, meta(system), { requests: [get(world, id)] }));
  return { world, id };
}

/** Фактична кількість по рядках: для заміни — кількість нового предмета. */
const qtyOf = (world: ReturnType<typeof createWorld>, id: string) =>
  Object.fromEntries(get(world, id).lines.map((l) => [l.id, l.kind === "replacement" ? l.newItem.qty : l.qty]));

test("закупівля: Відділ підтверджує — «Виконано», нове на складі бази, рядки «Закуплено» / «Замінено»; бюджет списується лише тепер", () => {
  const { world, id } = withExtract([byList("l1", "p1", 2), replacement("l2", "p2", 2, "3110", 90_00, 1)]);
  assert.equal(world.budget.total.approvedMinor, 0, "після підпису Голови бюджет ще не списано");
  const outcome = apply(world, confirmProcurement(world.ctx, meta(preparer(5)), { request: get(world, id), acceptanceDoc: "АП-17", recipient: "Склад бази", quantities: qtyOf(world, id), positions: POSITIONS, budget: world.budget }));
  const request = get(world, id);
  assert.equal(request.status, "procured");
  assert.equal(request.procurement?.acceptanceDoc, "АП-17");
  assert.deepEqual(request.lines.map((l) => lineStatus(request, l)), ["purchased", "replaced"]);
  assert.deepEqual(outcome.property?.map((p) => [p.tab, p.delta]), [["on_base", 2], ["on_base", 1]]);
  // Списано: 2 × 100 грн у 2210 і заміна на інший КЕКВ — 90 грн у 3110.
  assert.equal(world.budget.perKekv["2210"]?.approvedMinor, 200_00);
  assert.equal(world.budget.perKekv["3110"]?.approvedMinor, 90_00);
  assert.equal(outcome.notifications[0]?.kind, "request_procured");
});

test("закупівля: лише Відділ оборонних ресурсів (рівень 5); документ і отримувач обов'язкові; кількість має збігатися", () => {
  const { world, id } = withExtract([byList("l1", "p1", 2)]);
  const input = (patch = {}) => ({ request: get(world, id), acceptanceDoc: "АП-1", recipient: "Склад", quantities: qtyOf(world, id), positions: POSITIONS, budget: world.budget, ...patch });
  throwsCode(() => confirmProcurement(world.ctx, meta(admin), input()), "FORBIDDEN_ROLE");
  throwsCode(() => confirmProcurement(world.ctx, meta(preparer(4)), input()), "FORBIDDEN_ROLE");
  throwsCode(() => confirmProcurement(world.ctx, meta(author), input()), "FORBIDDEN_ROLE");
  throwsCode(() => confirmProcurement(world.ctx, meta(preparer(5)), input({ acceptanceDoc: " " })), "NOTE_REQUIRED");
  const error = throwsCode(() => confirmProcurement(world.ctx, meta(preparer(5)), input({ quantities: { l1: 1 } })), "INVALID_TRANSITION");
  assert.equal(error.details["reason"], "QTY_MISMATCH");
  assert.equal(get(world, id).status, "extract_issued");
});

test("видача: одним актом — нове в «Отримано», старе із заміни списується; лише після закупівлі", () => {
  const { world, id } = withExtract([byList("l1", "p1", 2), replacement("l2", "p2", 1, "2210", 50_00)]);
  throwsCode(() => issueProcured(world.ctx, meta(preparer(5)), { request: get(world, id), act: "А-1", positions: POSITIONS }), "INVALID_TRANSITION");
  apply(world, confirmProcurement(world.ctx, meta(preparer(5)), { request: get(world, id), acceptanceDoc: "АП-1", recipient: "Склад", quantities: qtyOf(world, id), positions: POSITIONS, budget: world.budget }));
  const outcome = apply(world, issueProcured(world.ctx, meta(preparer(5)), { request: get(world, id), act: "А-1", positions: POSITIONS }));
  assert.equal(get(world, id).status, "issued");
  assert.equal(get(world, id).procurement?.issueAct, "А-1");
  const moves = outcome.property?.map((p) => [p.tab, p.delta]);
  assert.deepEqual(moves, [["on_base", -2], ["received", 2], ["on_base", -1], ["received", 1], ["received", -1]]);
});

test("не закуплено: примітка обов'язкова, план повертається як був, бюджет не змінюється", () => {
  const { world, id } = withExtract([byList("l1", "p1", 2), replacement("l2", "p2", 2, "2210", 80_00, 1)]);
  const code = (get(world, id).lines[1] as Extract<ReturnType<typeof replacement>, { kind: "replacement" }>).newItem.code;
  throwsCode(() => closeNotProcured(world.ctx, meta(preparer(5)), { request: get(world, id), note: "", positions: POSITIONS }), "NOTE_REQUIRED");
  const outcome = apply(world, closeNotProcured(world.ctx, meta(preparer(5)), { request: get(world, id), note: "Постачальник не виконав договір", positions: POSITIONS }));
  const request = get(world, id);
  assert.equal(request.status, "not_procured");
  assert.equal(lineStatus(request, request.lines[0]!), "not_procured");
  // Стара позиція повертається в план, погоджена зміна зникає.
  assert.deepEqual(outcome.property?.map((p) => [p.code, p.tab, p.delta]), [["A-002", "planned", 2], [code, "planned", -1]]);
  assert.equal(outcome.budget, undefined);
  assert.equal(world.budget.total.approvedMinor, 0);
});
