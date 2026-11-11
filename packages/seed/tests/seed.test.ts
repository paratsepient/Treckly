import assert from "node:assert/strict";
import { test } from "node:test";
import * as contract from "@dsp/contract";
import {
  daysAtLevel,
  checkRequest,
  type Request,
  type RequestLine,
  type JournalEvent,
} from "@dsp/domain";
import {
  journal,
  loadBudget,
  loadLists,
  loadNow,
  loadPositions,
  loadRequests,
  notifications,
  openDb,
  requests as requestsTable,
} from "@dsp/db";
import { applySeed, generateSeed, resetDemo, type SeedData } from "../src/index.ts";

const seed = generateSeed();

/** Останній стан кожної заявки/переліку за результатами сценарію. */
function finalState(data: SeedData) {
  const requests = new Map<string, Request>();
  for (const o of data.outcomes) for (const r of o.requests) requests.set(r.id, r);
  return { requests, events: data.outcomes.flatMap((o) => o.events) };
}
const final = finalState(seed);
const byStatus = (status: Request["status"]) => [...final.requests.values()].filter((r) => r.status === status);

test("детермінованість: те саме зерно дає той самий результат", () => {
  const again = generateSeed();
  assert.deepEqual(again, seed);
  assert.equal(JSON.stringify(again), JSON.stringify(seed));
});

test("структура: 1 напрямок, 1 РУ, 2 бригади, 3 в/ч, по 1–2 відділи", () => {
  const kinds = (k: string) => seed.units.filter((u) => u.kind === k);
  assert.equal(kinds("direction").length, 1);
  assert.equal(kinds("ru").length, 1);
  assert.equal(kinds("brigade").length, 2);
  assert.equal(kinds("unit").length, 3);
  for (const unit of kinds("unit")) {
    const departments = seed.units.filter((u) => u.parentId === unit.id).length;
    assert.ok(departments >= 1 && departments <= 2, `${unit.name}: відділів ${departments}`);
  }
  assert.ok(seed.units.every((u) => u.parentId === null || seed.units.some((p) => p.id === u.parentId)), "кожен батьківський підрозділ існує");
  assert.ok(seed.units.filter((u) => u.kind === "unit").every((u) => /^в\/ч А\d{4}$/.test(u.name)), "умовні назви");
});

test("Попередній перелік: близько 40 позицій, 3 КЕКВ, унікальні коди, є пари для замін", () => {
  assert.ok(seed.listPositions.length >= 38 && seed.listPositions.length <= 45, `позицій: ${seed.listPositions.length}`);
  assert.equal(seed.kekv.length, 3);
  const codes = seed.items.map((i) => i.code);
  assert.equal(new Set(codes).size, codes.length, "коди номенклатури унікальні");
  assert.ok(seed.items.every((i) => seed.kekv.some((k) => k.code === i.kekv) && i.priceMinor > 0));

  const inList = new Set(seed.listPositions.map((p) => p.itemId));
  const candidates = seed.items.filter((i) => !inList.has(i.id));
  assert.ok(candidates.length >= 10);
  let sameKekv = 0;
  let otherKekv = 0;
  for (const position of seed.listPositions) {
    const item = seed.items.find((i) => i.id === position.itemId)!;
    for (const c of candidates.filter((c) => c.groupKey === item.groupKey)) c.kekv === item.kekv ? (sameKekv += 1) : (otherKekv += 1);
  }
  assert.ok(sameKekv > 0 && otherKekv > 0, `схожі в тому ж КЕКВ: ${sameKekv}, в іншому: ${otherKekv}`);
});

test("користувачі: автор у кожній в/ч, керівник і уповноважений на кожному підрозділі кожного рівня, адміністратор", () => {
  assert.equal(seed.users.filter((u) => u.roleKind === "author").length, 3);
  for (const [level, units] of [[1, 3], [2, 2], [3, 1], [4, 1], [5, 1]] as const) {
    for (const kind of ["preparer", "approver"] as const) {
      assert.equal(seed.users.filter((u) => u.roleKind === kind && u.level === level).length, units, `${kind} рівня ${level}`);
    }
  }
  assert.equal(seed.users.filter((u) => u.roleKind === "admin").length, 1);
  assert.equal(new Set(seed.users.map((u) => u.id)).size, seed.users.length);
  assert.ok(seed.users.filter((u) => u.roleKind !== "admin").every((u) => u.unitId && seed.units.some((x) => x.id === u.unitId)));
});

test("заявки: 10–12 у різних станах, як у документі", () => {
  assert.ok(final.requests.size >= 10 && final.requests.size <= 12, `заявок: ${final.requests.size}`);
  const levels = new Set(byStatus("at_level").map((r) => r.level));
  assert.deepEqual([...levels].sort(), [1, 2, 3, 4, 5], "у черзі є заявки кожного з п'яти рівнів");
  assert.equal(byStatus("draft").length, 1);
  assert.equal(byStatus("withdrawn").length, 1);
  assert.equal(byStatus("returned").length, 1);
  assert.equal(byStatus("extract_issued").length, 2, "2 затверджені з витягами");
  const approvedReplacementKinds = byStatus("extract_issued").map((r) => r.lines.some((l) => l.kind === "replacement"));
  assert.ok(approvedReplacementKinds.some(Boolean), "серед затверджених є заявка із заміною");
});

test("сформований, але непогоджений перелік: одна заявка в ньому, одна поза ним на тому ж рівні", () => {
  const inList = byStatus("in_list");
  assert.equal(inList.length, 1);
  const list = seed.outcomes.flatMap((o) => o.lists).filter((l) => l.status === "formed").at(-1)!;
  assert.deepEqual(list.requestIds, [inList[0]!.id]);
  const outside = byStatus("at_level").filter((r) => r.level === inList[0]!.level && r.route[0] === inList[0]!.route[0]);
  assert.equal(outside.length, 1, "необрана лишається в черзі");
});

test("повернута з рівня 3: примітка й каскад L2, L1, автор", () => {
  const returned = byStatus("returned")[0]!;
  assert.equal(returned.returnInfo?.level, 3);
  assert.ok((returned.returnInfo?.note.length ?? 0) > 10);
  assert.deepEqual(
    returned.returnInfo?.cascade.map((a) => (a.kind === "author" ? "author" : a.level)),
    [2, 1, "author"],
  );
});

test("одна заявка лежить довго, а затверджені мають номери СЕДО", () => {
  const now = seed.now.slice(0, 10);
  const longest = Math.max(...byStatus("at_level").map((r) => daysAtLevel(r, now)));
  assert.ok(longest >= 10, `найдовше на рівні: ${longest} дн.`);
  const approvedLists = seed.outcomes.flatMap((o) => o.lists).filter((l) => l.status === "approved");
  assert.ok(approvedLists.length >= 9);
  assert.ok(approvedLists.every((l) => Number.isInteger(l.sedoNumber) && (l.sedoNumber ?? 0) > 0));
  assert.equal(new Set(approvedLists.map((l) => l.sedoNumber)).size, approvedLists.length, "номери СЕДО різні");
});

test("журнал і трек узгоджені: переходи кожної заявки утворюють безперервний ланцюжок", () => {
  const perRequest = new Map<string, JournalEvent[]>();
  for (const e of final.events) if (e.requestId) perRequest.set(e.requestId, [...(perRequest.get(e.requestId) ?? []), e]);
  for (const [id, events] of perRequest) {
    assert.equal(events[0]?.type, "request.created", id);
    let state: string | null = null;
    for (const e of events) {
      if (e.from !== null) assert.equal(e.from, state, `${id}: ${e.type} очікує ${e.from}, а стан ${state}`);
      if (e.to !== null) state = e.to;
    }
    assert.equal(state, final.requests.get(id)?.status, `${id}: підсумковий статус`);
  }
  const keys = final.events.map((e) => e.idempotencyKey);
  assert.ok(keys.every((k) => k.startsWith("seed-")));
});

test("кожна дія в журналі виконана існуючим користувачем (або системою)", () => {
  const ids = new Set([...seed.users.map((u) => u.id), "system"]);
  for (const e of final.events) assert.ok(ids.has(e.actorId), `невідомий виконавець ${e.actorId}`);
});

test("бюджет: ліміти не менші за затверджене; ліміт 3110 впирається, «у роботі» перевищує залишок", () => {
  const budget = seed.budget;
  assert.ok(budget.total.approvedMinor > 0);
  for (const [kekv, line] of Object.entries(budget.perKekv)) {
    assert.ok(line.limitMinor >= line.approvedMinor, `${kekv}: ліміт ≥ затверджене`);
  }
  assert.equal(budget.total.limitMinor, Object.values(budget.perKekv).reduce((s, l) => s + l.limitMinor, 0));
  assert.equal(budget.total.approvedMinor, Object.values(budget.perKekv).reduce((s, l) => s + l.approvedMinor, 0), "затверджене по КЕКВ дає загальне");
  const remaining3110 = budget.perKekv["3110"]!.limitMinor - budget.perKekv["3110"]!.approvedMinor;
  assert.equal(remaining3110, 100_000_00);
});

function checkNew(lines: RequestLine[], positions: Awaited<ReturnType<typeof loadPositions>>) {
  return checkRequest({ lines, positions, budget: seed.budget, requests: [...final.requests.values()] });
}

test("демо-перевірки: велика заявка на 3110 блокується бюджетом, середня дає попередження", async () => {
  const { db } = await openDb();
  await applySeed(db, seed);
  const positions = await loadPositions(db, seed.directionId);
  const drone = seed.listPositions.find((p) => seed.items.find((i) => i.id === p.itemId)?.name === "Квадрокоптер розвідувальний")!;
  const radio = seed.listPositions.find((p) => seed.items.find((i) => i.id === p.itemId)?.name === "Радіостанція носима цифрова")!;

  const blocked = checkNew([{ kind: "by_list", id: "x", positionId: drone.id, qty: 1, kekv: "3110" }], positions);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.errors[0]?.code, "BUDGET_EXCEEDED");

  const warned = checkNew([{ kind: "by_list", id: "x", positionId: radio.id, qty: 1, kekv: "3110" }], positions);
  assert.equal(warned.ok, true);
  assert.ok(warned.warnings.some((w) => w.details["scope"] === "3110"), "сума «у роботі» перевищує залишок");
});

test("запис у базу: стан у базі збігається зі станом сценарію", async () => {
  const { db } = await openDb();
  await applySeed(db, seed);

  const stored = new Map((await loadRequests(db)).map((r) => [r.id, r]));
  assert.deepEqual([...stored.keys()].sort(), [...final.requests.keys()].sort());
  for (const [id, request] of final.requests) assert.deepEqual(stored.get(id), request, id);

  assert.equal((await db.select().from(journal)).length, final.events.length);
  assert.equal((await db.select().from(notifications)).length, seed.outcomes.reduce((n, o) => n + o.notifications.length, 0));
  assert.deepEqual(await loadBudget(db, seed.directionId), seed.budget);
  assert.equal(await loadNow(db), seed.now);

  const lists = await loadLists(db);
  const lastLists = new Map<string, (typeof lists)[number]>();
  for (const o of seed.outcomes) for (const l of o.lists) lastLists.set(l.id, l);
  assert.equal(lists.length, lastLists.size);

  const positions = await loadPositions(db, seed.directionId);
  const approvedQty = [...final.requests.values()]
    .filter((r) => r.status === "extract_issued")
    .flatMap((r) => r.lines)
    .reduce((sum, l) => sum + l.qty, 0);
  const plannedQty = seed.listPositions.reduce((sum, p) => sum + p.plannedQty, 0);
  assert.equal(Object.values(positions).reduce((sum, p) => sum + p.availableQty, 0), plannedQty - approvedQty);
});

test("«Скинути демо»: після змін база повертається до того самого початкового стану", async () => {
  const { pg, db } = await openDb();
  await applySeed(db, seed);
  const snapshot = async () => ({
    requests: await loadRequests(db),
    budget: await loadBudget(db, seed.directionId),
    journal: (await db.select().from(journal)).length,
    now: await loadNow(db),
  });
  const before = await snapshot();

  await pg.exec("UPDATE requests SET status = 'withdrawn'; UPDATE budgets SET approved_minor = 0");
  assert.notDeepEqual(await snapshot(), before);

  await resetDemo(pg, db, seed);
  assert.deepEqual(await snapshot(), before);
  assert.equal((await db.select().from(requestsTable)).length, final.requests.size);
});

test("усе згенероване проходить схеми контракту", () => {
  const parse = <T>(schema: { parse(v: unknown): T }, values: readonly unknown[]) => values.forEach((v) => schema.parse(v));
  parse(contract.Unit, seed.units);
  parse(contract.User, seed.users);
  parse(contract.KekvInfo, seed.kekv);
  parse(
    contract.Item,
    seed.items.map(({ groupKey, ...item }) => ({ ...item, group: groupKey })),
  );
  parse(contract.Budget, [seed.budget]);
  for (const o of seed.outcomes) {
    parse(contract.Request, o.requests);
    parse(contract.DailyList, o.lists);
    parse(contract.JournalEvent, o.events);
    parse(contract.Notification, o.notifications);
    parse(contract.Extract, o.extracts ?? []);
  }
});

test("«Моє майно»: для кожної в/ч заповнено три вкладки", () => {
  for (const unit of ["unit-a", "unit-b", "unit-c"]) {
    for (const tab of ["planned", "on_base", "received"]) {
      const rows = seed.property.filter((p) => p.unitId === unit && p.tab === tab);
      assert.equal(rows.length, 5, `${unit}/${tab}`);
      assert.ok(rows.every((r) => r.qty > 0 && seed.listPositions.some((p) => p.itemId === r.itemId)));
    }
  }
});
