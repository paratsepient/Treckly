import assert from "node:assert/strict";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import {
  approveList,
  createDraft,
  createManualClock,
  createSequentialIds,
  disbandList,
  DomainError,
  formList,
  issueExtracts,
  returnRequest,
  submit,
  type Actor,
  type DomainContext,
  type Outcome,
  type RequestLine,
  type Route,
} from "@dsp/domain";
import {
  budgets,
  idempotencyKeys,
  journal,
  listPositions,
  loadBudget,
  loadList,
  loadLists,
  loadNotifications,
  loadNow,
  markNotificationsRead,
  loadPositions,
  loadRequest,
  loadRequests,
  nomenclature,
  notifications,
  openDb,
  resetDb,
  runMigrations,
  saveNotifications,
  saveNow,
  saveOutcome,
  type DspDb,
} from "../src/index.ts";

const DIRECTION = "dir-1";
const ROUTE: Route = ["u-vch", "u-brig", "u-ru", DIRECTION, "u-vor"];
const author: Actor = { userId: "a1", role: { kind: "author", unitId: "u-vch" } };
const system: Actor = { userId: "system", role: { kind: "system" } };
const prep = (level: 1 | 2 | 3 | 4 | 5): Actor => ({ userId: `p${level}`, role: { kind: "preparer", level, unitId: ROUTE[level - 1] as string } });
const appr = (level: 1 | 2 | 3 | 4 | 5): Actor => ({ userId: `g${level}`, role: { kind: "approver", level, unitId: ROUTE[level - 1] as string } });

let n = 0;
const meta = (actor: Actor) => ({ actor, idempotencyKey: `k-${(n += 1)}` });

async function setup() {
  const { pg, db } = await openDb();
  const clock = createManualClock("2027-02-01T09:00:00Z");
  const ctx: DomainContext = { clock, ids: createSequentialIds() };
  await db.insert(nomenclature).values([
    { id: "n1", code: "A-1", name: "Дрон", kekv: "2210", priceMinor: 100_00, measure: "шт.", groupKey: "g" },
    { id: "n2", code: "A-2", name: "Акумулятор", kekv: "2210", priceMinor: 50_00, measure: "шт.", groupKey: "g" },
    { id: "n3", code: "B-1", name: "Станція", kekv: "3110", priceMinor: 200_00, measure: "шт.", groupKey: "g" },
  ]);
  await db.insert(listPositions).values([
    { id: "p1", directionId: DIRECTION, itemId: "n1", plannedQty: 10 },
    { id: "p2", directionId: DIRECTION, itemId: "n2", plannedQty: 5 },
    { id: "p3", directionId: DIRECTION, itemId: "n3", plannedQty: 3 },
  ]);
  await db.insert(budgets).values([
    { directionId: DIRECTION, scope: "TOTAL", limitMinor: 1_000_00, approvedMinor: 0 },
    { directionId: DIRECTION, scope: "2210", limitMinor: 600_00, approvedMinor: 0 },
    { directionId: DIRECTION, scope: "3110", limitMinor: 500_00, approvedMinor: 0 },
  ]);
  return { pg, db, ctx, clock };
}

type Setup = Awaited<ReturnType<typeof setup>>;

const lines = (...l: RequestLine[]) => l;
const byList = (id: string, positionId: string, qty: number, kekv = "2210"): RequestLine => ({ kind: "by_list", id, positionId, qty, kekv });

interface State {
  readonly requests: Awaited<ReturnType<typeof loadRequests>>;
  readonly lists: Awaited<ReturnType<typeof loadLists>>;
  readonly budget: Awaited<ReturnType<typeof loadBudget>>;
  readonly positions: Awaited<ReturnType<typeof loadPositions>>;
}

/** Виконує команду домену над поточним станом бази й записує результат однією транзакцією. */
async function run(s: Setup, command: (state: State) => Outcome): Promise<Outcome> {
  return s.db.transaction(async (tx) => {
    const [requests, lists, budget, positions] = await Promise.all([loadRequests(tx), loadLists(tx), loadBudget(tx, DIRECTION), loadPositions(tx, DIRECTION)]);
    const outcome = command({ requests, lists, budget, positions });
    await saveOutcome(tx, outcome, DIRECTION);
    return outcome;
  });
}

let sedo = 5000;
/** Погоджує перелік керівником його рівня; перелік і заявки беруться зі стану бази. */
function approveFrom(s: Setup, st: State, listId: string): Outcome {
  const list = st.lists.find((l) => l.id === listId);
  if (!list) throw new Error(`Немає переліку ${listId}`);
  return approveList(s.ctx, meta(list.level === 5 ? prep(5) : appr(list.level)), {
    list,
    requests: st.requests.filter((r) => list.requestIds.includes(r.id)),
    sedoNumber: (sedo += 1),
    positions: st.positions,
    budget: st.budget,
  });
}

async function newSubmitted(s: Setup, l: RequestLine[]): Promise<string> {
  const draft = await run(s, () => createDraft(s.ctx, meta(author), { route: ROUTE, lines: l, justification: "Потреба підрозділу на 2027 рік." }));
  const id = draft.requests[0]!.id;
  await run(s, (st) => submit(s.ctx, meta(author), { request: st.requests.find((r) => r.id === id)!, positions: st.positions, unitPlan: Object.fromEntries(Object.keys(st.positions).map((k) => [k, 1000])), budget: st.budget, requests: st.requests }));
  return id;
}

test("міграції: повторний запуск нічого не застосовує; resetDb відтворює схему", async () => {
  const { pg } = await openDb();
  assert.deepEqual(await runMigrations(pg), []);
  await pg.exec("INSERT INTO kekv (code, name) VALUES ('1', 'x')");
  await resetDb(pg);
  assert.equal((await pg.query("SELECT 1 FROM kekv")).rows.length, 0);
});

test("журнал лише доповнюється: UPDATE і DELETE відхиляються базою", async () => {
  const s = await setup();
  await newSubmitted(s, lines(byList("l1", "p1", 1)));
  for (const sql of ["DELETE FROM journal", "UPDATE journal SET type = 'x'"]) {
    await assert.rejects(() => s.pg.query(sql), /append-only/);
  }
  assert.ok((await s.db.select().from(journal)).length >= 2);
});

test("заявка зберігається й читається без втрат (рядки за переліком і заміни)", async () => {
  const s = await setup();
  const replacement: RequestLine = { kind: "replacement", id: "l2", positionId: "p1", qty: 2, kekv: "2210", newItem: { code: "N-9", name: "Інший", kekv: "3110", priceMinor: 150_00 } };
  const outcome = await run(s, () => createDraft(s.ctx, meta(author), { route: ROUTE, lines: lines(byList("l1", "p2", 1), replacement), justification: "Потреба підрозділу на 2027 рік." }));
  const saved = await loadRequest(s.db, outcome.requests[0]!.id);
  assert.deepEqual(saved, outcome.requests[0]);
});

test("весь шлях заявки через базу: рівні 1–5, затвердження, резерв, витяг; стан у базі = стан домену", async () => {
  const s = await setup();
  const id = await newSubmitted(s, lines(byList("l1", "p1", 2), { kind: "replacement", id: "l2", positionId: "p2", qty: 1, kekv: "2210", newItem: { code: "N", name: "Н", kekv: "3110", priceMinor: 120_00 } }));

  for (const level of [1, 2, 3, 4, 5] as const) {
    s.clock.advanceDays(1);
    const formed = await run(s, (st) =>
      formList(s.ctx, meta(prep(level)), { level, unitId: ROUTE[level - 1] as string, selected: [st.requests.find((r) => r.id === id)!], existingLists: [] }),
    );
    const listId = formed.lists[0]!.id;
    await run(s, (st) => approveFrom(s, st, listId));
  }
  const approved = (await loadRequest(s.db, id))!;
  assert.equal(approved.status, "approved");
  assert.equal((await loadBudget(s.db, DIRECTION)).perKekv["3110"]?.approvedMinor, 120_00);

  const reserved = (await loadPositions(s.db, DIRECTION))["p1"]!;
  assert.equal(reserved.availableQty, 10 - 2, "доступна кількість зменшилась на затверджену");

  await run(s, (st) => issueExtracts(s.ctx, meta(system), { requests: st.requests.filter((r) => r.id === id) }));
  const issued = (await loadRequest(s.db, id))!;
  assert.equal(issued.status, "extract_issued");
  const xl = await s.pg.query<{ status: string }>("SELECT status FROM extract_lines ORDER BY line_id");
  assert.deepEqual(xl.rows.map((r) => r.status), ["approved", "replacement_agreed"]);

  const lists = await loadLists(s.db);
  assert.equal(lists.length, 5);
  assert.ok(lists.every((l) => l.status === "approved" && l.sedoNumber !== null && l.requestIds.join() === id));
});

test("версія запису перевіряється в базі: застарілий запис → VERSION_CONFLICT, транзакція відкочується", async () => {
  const s = await setup();
  const id = await newSubmitted(s, lines(byList("l1", "p1", 1)));
  const stale = (await loadRequest(s.db, id))!;
  await run(s, (st) => returnRequest(s.ctx, meta(prep(1)), { request: st.requests.find((r) => r.id === id)!, note: "ні" }));
  const journalBefore = (await s.db.select().from(journal)).length;
  const notificationsBefore = (await s.db.select().from(notifications)).length;

  await assert.rejects(
    () =>
      s.db.transaction(async (tx) => {
        const outcome = returnRequest(s.ctx, meta(prep(1)), { request: stale, note: "вдруге" });
        await saveOutcome(tx, outcome, DIRECTION);
      }),
    (error: unknown) => error instanceof DomainError && error.code === "VERSION_CONFLICT",
  );
  assert.equal((await s.db.select().from(journal)).length, journalBefore, "журнал відкотився");
  assert.equal((await s.db.select().from(notifications)).length, notificationsBefore, "сповіщення відкотились");
  assert.equal((await loadRequest(s.db, id))!.status, "returned");
});

test("повернення: каскад сповіщень зберігається з колонками адресата", async () => {
  const s = await setup();
  const id = await newSubmitted(s, lines(byList("l1", "p1", 1)));
  for (const level of [1, 2] as const) {
    const formed = await run(s, (st) => formList(s.ctx, meta(prep(level)), { level, unitId: ROUTE[level - 1] as string, selected: [st.requests.find((r) => r.id === id)!], existingLists: [] }));
    await run(s, (st) => approveFrom(s, st, formed.lists[0]!.id));
    s.clock.advanceDays(1);
  }
  await run(s, (st) => returnRequest(s.ctx, meta(prep(3)), { request: st.requests.find((r) => r.id === id)!, note: "Уточніть" }));
  const rows = await s.db.select().from(notifications).where(eq(notifications.kind, "request_returned"));
  assert.deepEqual(
    rows.map((r) => [r.audienceLevel, r.audienceUserId]),
    [[2, null], [1, null], [null, "a1"]],
  );
  assert.ok(rows.every((r) => r.note === "Уточніть"));
});

test("перелік: склад і порядок заявок зберігаються; розформований перелік лишається в історії", async () => {
  const s = await setup();
  const a = await newSubmitted(s, lines(byList("l1", "p1", 1)));
  const b = await newSubmitted(s, lines(byList("l1", "p2", 1)));
  const formed = await run(s, (st) => formList(s.ctx, meta(prep(1)), { level: 1, unitId: "u-vch", selected: [st.requests.find((r) => r.id === b)!, st.requests.find((r) => r.id === a)!], existingLists: [] }));
  const listId = formed.lists[0]!.id;
  const list = await loadList(s.db, listId);
  assert.deepEqual(list?.requestIds, [b, a]);
  assert.equal(list?.status, "formed");
  assert.equal((await loadRequest(s.db, a))!.listId, listId);

  await run(s, (st) => disbandList(s.ctx, meta(prep(1)), { list: st.lists.find((l) => l.id === listId)!, requests: st.requests.filter((r) => r.listId === listId) }));
  const after = await loadList(s.db, listId);
  assert.equal(after?.status, "disbanded");
  assert.deepEqual(after?.requestIds, [b, a], "склад розформованого переліку збережено для історії");
  assert.equal((await loadRequest(s.db, a))!.listId, null);
  assert.equal((await loadRequest(s.db, a))!.status, "at_level");
});

test("доступна кількість рахується від затверджених заявок, а не від поданих", async () => {
  const s = await setup();
  await newSubmitted(s, lines(byList("l1", "p3", 2, "3110")));
  assert.equal((await loadPositions(s.db, DIRECTION))["p3"]!.availableQty, 3);
});

test("бюджет і симульований час зберігаються й перезаписуються", async () => {
  const s = await setup();
  assert.equal((await loadBudget(s.db, DIRECTION)).total.limitMinor, 1_000_00);
  await saveNow(s.db, "2027-02-01T09:00:00.000Z");
  await saveNow(s.db, "2027-02-02T09:00:00.000Z");
  assert.equal(await loadNow(s.db), "2027-02-02T09:00:00.000Z");
  await assert.rejects(() => loadBudget(s.db, "no-dir"), /Немає бюджету/);
});

test("ключі ідемпотентності: повторний ключ відхиляється первинним ключем таблиці", async () => {
  const s: DspDb = (await setup()).db;
  await s.insert(idempotencyKeys).values({ key: "k", status: 200, response: {} });
  await assert.rejects(() => s.insert(idempotencyKeys).values({ key: "k", status: 200, response: {} }));
});

test("сповіщення: автор бачить свої, роль рівня — лише свого рівня, підрозділу й ролі; чужі не видно", async () => {
  const s = await setup();
  const at = "2027-02-15T09:00:00.000Z";
  const note = (audience: Parameters<typeof saveNotifications>[1][number]["audience"], requestId = "r1") =>
    ({ kind: "reminder" as const, audience, requestId, listId: null, note: null, at });
  await saveNotifications(s.db, [
    note({ kind: "author", userId: "a1" }),
    note({ kind: "author", userId: "a2" }),
    note({ kind: "level", level: 1, unitId: "u-vch", role: "preparer" }),
    note({ kind: "level", level: 1, unitId: "u-vch", role: "approver" }),
    note({ kind: "level", level: 1, unitId: "u-vch", role: "both" }),
    note({ kind: "level", level: 1, unitId: "u-other", role: "both" }),
    note({ kind: "level", level: 2, unitId: "u-brig", role: "both" }),
  ]);
  const ids = async (reader: Parameters<typeof loadNotifications>[1]) => (await loadNotifications(s.db, reader)).map((n) => n.audience.kind === "author" ? `автор:${n.audience.userId}` : `L${n.audience.level}:${n.audience.unitId}:${n.audience.role}`);
  assert.deepEqual(await ids({ userId: "a1", roleKind: "author", level: null, unitId: "u-vch" }), ["автор:a1"]);
  assert.deepEqual((await ids({ userId: "p", roleKind: "preparer", level: 1, unitId: "u-vch" })).sort(), ["L1:u-vch:both", "L1:u-vch:preparer"]);
  assert.deepEqual((await ids({ userId: "g", roleKind: "approver", level: 1, unitId: "u-vch" })).sort(), ["L1:u-vch:approver", "L1:u-vch:both"]);
  assert.deepEqual(await ids({ userId: "x", roleKind: "admin", level: null, unitId: null }), [], "адміністратор сповіщень не отримує");
});

test("сповіщення: прочитання лише своїх, повторне не рахується, нові згори", async () => {
  const s = await setup();
  const at = "2027-02-15T09:00:00.000Z";
  await saveNotifications(s.db, [
    { kind: "request_returned", audience: { kind: "author", userId: "a1" }, requestId: "r1", listId: null, note: "перше", at },
    { kind: "request_returned", audience: { kind: "author", userId: "a1" }, requestId: "r2", listId: null, note: "друге", at },
    { kind: "request_returned", audience: { kind: "author", userId: "a2" }, requestId: "r3", listId: null, note: "чуже", at },
  ]);
  const reader = { userId: "a1", roleKind: "author" as const, level: null, unitId: "u-vch" };
  const before = await loadNotifications(s.db, reader);
  assert.deepEqual(before.map((n) => n.note), ["друге", "перше"]);
  assert.ok(before.every((n) => n.readAt === null));

  const foreign = (await loadNotifications(s.db, { ...reader, userId: "a2" }))[0]!;
  assert.equal(await markNotificationsRead(s.db, reader, at, [foreign.id]), 0, "чужі сповіщення не чіпає");
  assert.equal(await markNotificationsRead(s.db, reader, at, [before[0]!.id]), 1);
  assert.equal(await markNotificationsRead(s.db, reader, at, [before[0]!.id]), 0, "вдруге те саме не рахується");
  assert.equal(await markNotificationsRead(s.db, reader, at), 1, "решта своїх");
  assert.ok((await loadNotifications(s.db, reader)).every((n) => n.readAt === at));
  assert.equal((await loadNotifications(s.db, { ...reader, userId: "a2" }))[0]?.readAt, null);
});
