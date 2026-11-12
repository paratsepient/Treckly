import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  DomainError,
  type Audience,
  type Budget,
  type DailyList,
  type Extract,
  type JournalEvent,
  type Level,
  type Notification,
  type Outcome,
  type Positions,
  type Request,
  type RequestLine,
  type RequestStatus,
  type Route,
} from "@dsp/domain";
import type { Queryable } from "./client.ts";
import {
  budgets,
  dailyListRequests,
  dailyLists,
  demoState,
  extractLines,
  extracts,
  journal,
  listPositions,
  nomenclature,
  notifications,
  propertyItems,
  requestLines,
  requests,
} from "./schema.ts";

const conflict = (id: string) => new DomainError("VERSION_CONFLICT", "Запис змінено іншою дією. Оновіть сторінку.", { id });

function audienceColumns(a: Audience) {
  return a.kind === "author"
    ? { audienceUserId: a.userId, audienceLevel: null, audienceUnitId: null, audienceRole: null }
    : { audienceUserId: null, audienceLevel: a.level, audienceUnitId: a.unitId, audienceRole: a.role };
}

/**
 * Записує результат команди домену. Викликається всередині транзакції: заявки,
 * переліки (з перевіркою версії на рівні бази), бюджет, витяги, сповіщення й журнал — разом.
 */
export async function saveOutcome(tx: Queryable, outcome: Outcome, directionId: string): Promise<void> {
  for (const r of outcome.requests) {
    const row = {
      id: r.id,
      authorId: r.authorId,
      directionId,
      route: [...r.route],
      version: r.version,
      revision: r.revision,
      status: r.status,
      level: r.level,
      listId: r.listId,
      justification: r.justification,
      returnInfo: r.returnInfo,
      levelEnteredOn: r.levelEnteredOn,
      createdOn: r.createdOn,
    };
    if (r.revision === 1) {
      await tx.insert(requests).values(row);
    } else {
      const updated = await tx
        .update(requests)
        .set(row)
        .where(and(eq(requests.id, r.id), eq(requests.revision, r.revision - 1)))
        .returning({ id: requests.id });
      if (updated.length === 0) throw conflict(r.id);
    }
    await tx.delete(requestLines).where(eq(requestLines.requestId, r.id));
    if (r.lines.length > 0) {
      await tx.insert(requestLines).values(
        r.lines.map((line, ord) => ({
          id: line.id,
          requestId: r.id,
          ord,
          kind: line.kind,
          positionId: line.positionId,
          qty: line.qty,
          kekv: line.kekv,
          newItem: line.kind === "replacement" ? { ...line.newItem } : null,
        })),
      );
    }
  }

  for (const l of outcome.lists) {
    const row = {
      id: l.id,
      level: l.level,
      unitId: l.unitId,
      date: l.date,
      status: l.status,
      formedBy: l.formedBy,
      sedoNumber: l.sedoNumber,
      approvedBy: l.approvedBy,
      revision: l.revision,
    };
    if (l.revision === 1) {
      await tx.insert(dailyLists).values(row);
      await tx.insert(dailyListRequests).values(l.requestIds.map((requestId, ord) => ({ listId: l.id, requestId, ord })));
    } else {
      const updated = await tx
        .update(dailyLists)
        .set(row)
        .where(and(eq(dailyLists.id, l.id), eq(dailyLists.revision, l.revision - 1)))
        .returning({ id: dailyLists.id });
      if (updated.length === 0) throw conflict(l.id);
    }
  }

  if (outcome.budget) await saveBudget(tx, directionId, outcome.budget);

  for (const x of outcome.extracts ?? []) {
    await tx.insert(extracts).values({ id: x.id, unitId: x.unitId, date: x.date });
    if (x.lines.length > 0) await tx.insert(extractLines).values(x.lines.map((line) => ({ extractId: x.id, ...line })));
  }

  await saveNotifications(tx, outcome.notifications);

  if (outcome.events.length > 0) {
    await tx.insert(journal).values(
      outcome.events.map((e) => ({
        at: e.at,
        type: e.type,
        requestId: e.requestId,
        listId: e.listId,
        actorId: e.actorId,
        idempotencyKey: e.idempotencyKey,
        data: e,
      })),
    );
  }
}

/** Сповіщення в системі: адресат зберігається і структурою, і колонками для швидкого відбору «моїх». */
export async function saveNotifications(tx: Queryable, notes: readonly Notification[]): Promise<void> {
  if (notes.length === 0) return;
  await tx.insert(notifications).values(
    notes.map((n) => ({
      kind: n.kind,
      audience: n.audience,
      ...audienceColumns(n.audience),
      requestId: n.requestId,
      listId: n.listId,
      note: n.note,
      at: n.at,
    })),
  );
}

/** Хто читає сповіщення: автор — за собою, роль рівня — за рівнем, підрозділом і роллю. */
export interface Reader {
  readonly userId: string;
  readonly roleKind: "author" | "preparer" | "approver" | "admin";
  readonly level: number | null;
  readonly unitId: string | null;
}

function visibleTo(reader: Reader) {
  if (reader.roleKind === "author") return eq(notifications.audienceUserId, reader.userId);
  if ((reader.roleKind === "preparer" || reader.roleKind === "approver") && reader.level !== null && reader.unitId !== null) {
    return and(
      eq(notifications.audienceLevel, reader.level),
      eq(notifications.audienceUnitId, reader.unitId),
      inArray(notifications.audienceRole, ["both", reader.roleKind]),
    );
  }
  return sql`false`;
}

export type StoredNotification = Notification & { readonly id: number; readonly readAt: string | null };

/** Останні сповіщення читача, нові згори. */
export async function loadNotifications(q: Queryable, reader: Reader, limit = 100): Promise<StoredNotification[]> {
  const rows = await q.select().from(notifications).where(visibleTo(reader)).orderBy(desc(notifications.id)).limit(limit);
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as Notification["kind"],
    audience: r.audience,
    requestId: r.requestId,
    listId: r.listId,
    note: r.note,
    at: r.at,
    readAt: r.readAt,
  }));
}

/** Позначає прочитаними сповіщення читача (усі або вказані); чужі не чіпає. */
export async function markNotificationsRead(q: Queryable, reader: Reader, at: string, ids?: readonly number[]): Promise<number> {
  const scope = and(visibleTo(reader), isNull(notifications.readAt), ids ? inArray(notifications.id, [...ids]) : undefined);
  const updated = await q.update(notifications).set({ readAt: at }).where(scope).returning({ id: notifications.id });
  return updated.length;
}

export async function saveBudget(tx: Queryable, directionId: string, budget: Budget): Promise<void> {
  const rows = [
    { directionId, scope: "TOTAL", limitMinor: budget.total.limitMinor, approvedMinor: budget.total.approvedMinor },
    ...Object.entries(budget.perKekv).map(([scope, line]) => ({ directionId, scope, limitMinor: line.limitMinor, approvedMinor: line.approvedMinor })),
  ];
  for (const row of rows) {
    await tx
      .insert(budgets)
      .values(row)
      .onConflictDoUpdate({ target: [budgets.directionId, budgets.scope], set: { limitMinor: row.limitMinor, approvedMinor: row.approvedMinor } });
  }
}

export async function loadBudget(q: Queryable, directionId: string): Promise<Budget> {
  const rows = await q.select().from(budgets).where(eq(budgets.directionId, directionId));
  const total = rows.find((r) => r.scope === "TOTAL");
  if (!total) throw new Error(`Немає бюджету напрямку ${directionId}`);
  return {
    total: { limitMinor: total.limitMinor, approvedMinor: total.approvedMinor },
    perKekv: Object.fromEntries(rows.filter((r) => r.scope !== "TOTAL").map((r) => [r.scope, { limitMinor: r.limitMinor, approvedMinor: r.approvedMinor }])),
  };
}

/**
 * Попередній перелік напрямку з доступною кількістю: план мінус кількість у затверджених
 * заявках (за переліком і замінах).
 */
export async function loadPositions(q: Queryable, directionId: string): Promise<Positions> {
  const reserved = sql<number>`coalesce((
    select sum(rl.qty) from ${requestLines} rl join ${requests} r on r.id = rl.request_id
    where rl.position_id = ${listPositions.id} and r.status in ('approved', 'extract_issued')
  ), 0)::int`;
  const rows = await q
    .select({
      id: listPositions.id,
      code: nomenclature.code,
      name: nomenclature.name,
      kekv: nomenclature.kekv,
      priceMinor: nomenclature.priceMinor,
      planned: listPositions.plannedQty,
      reserved,
    })
    .from(listPositions)
    .innerJoin(nomenclature, eq(nomenclature.id, listPositions.itemId))
    .where(eq(listPositions.directionId, directionId));
  return Object.fromEntries(
    rows.map((r) => [r.id, { id: r.id, code: r.code, name: r.name, kekv: r.kekv, priceMinor: r.priceMinor, availableQty: r.planned - r.reserved }]),
  );
}

/**
 * План в/ч на 2027 рік: id позиції переліку напрямку → скільки заплановано в підрозділі (вкладка «Заплановано»
 * в «Моєму майні»). Позиції, якої немає в плані в/ч, у відповіді немає.
 */
export async function loadUnitPlan(q: Queryable, unitId: string, directionId: string): Promise<Record<string, number>> {
  const rows = await q
    .select({ positionId: listPositions.id, qty: propertyItems.qty })
    .from(propertyItems)
    .innerJoin(listPositions, eq(listPositions.itemId, propertyItems.itemId))
    .where(and(eq(propertyItems.unitId, unitId), eq(propertyItems.tab, "planned"), eq(listPositions.directionId, directionId)));
  const plan: Record<string, number> = {};
  for (const row of rows) plan[row.positionId] = (plan[row.positionId] ?? 0) + row.qty;
  return plan;
}

/**
 * Запланований перелік закупівель напрямку: позиції з планом напрямку, резервом під затверджені заявки
 * і планом кожної в/ч («Заплановано» в її майні). «У роботі» додає API із заявок.
 */
export async function loadPlannedList(q: Queryable, directionId: string) {
  const reserved = sql<number>`coalesce((
    select sum(rl.qty) from ${requestLines} rl join ${requests} r on r.id = rl.request_id
    where rl.position_id = ${listPositions.id} and r.status in ('approved', 'extract_issued')
  ), 0)::int`;
  const [rows, plans] = await Promise.all([
    q
      .select({
        id: listPositions.id,
        itemId: listPositions.itemId,
        code: nomenclature.code,
        name: nomenclature.name,
        kekv: nomenclature.kekv,
        priceMinor: nomenclature.priceMinor,
        measure: nomenclature.measure,
        plannedQty: listPositions.plannedQty,
        reservedQty: reserved,
      })
      .from(listPositions)
      .innerJoin(nomenclature, eq(nomenclature.id, listPositions.itemId))
      .where(eq(listPositions.directionId, directionId))
      .orderBy(asc(nomenclature.code)),
    q.select({ unitId: propertyItems.unitId, itemId: propertyItems.itemId, qty: propertyItems.qty }).from(propertyItems).where(eq(propertyItems.tab, "planned")),
  ]);
  return rows.map(({ itemId, ...row }) => ({
    ...row,
    units: plans.filter((p) => p.itemId === itemId).map((p) => ({ unitId: p.unitId, qty: p.qty })).sort((a, b) => a.unitId.localeCompare(b.unitId)),
  }));
}

type RequestRow = typeof requests.$inferSelect;
type LineRow = typeof requestLines.$inferSelect;

function toLine(row: LineRow): RequestLine {
  const base = { id: row.id, positionId: row.positionId, qty: row.qty, kekv: row.kekv };
  if (row.kind === "replacement") {
    if (!row.newItem) throw new Error(`Рядок заміни ${row.id} без нового предмета`);
    return { kind: "replacement", ...base, newItem: row.newItem };
  }
  return { kind: "by_list", ...base };
}

function toRequest(row: RequestRow, lines: readonly LineRow[]): Request {
  return {
    id: row.id,
    authorId: row.authorId,
    route: row.route as unknown as Route,
    version: row.version,
    revision: row.revision,
    status: row.status as RequestStatus,
    level: row.level as Level | null,
    listId: row.listId,
    lines: lines.filter((l) => l.requestId === row.id).sort((a, b) => a.ord - b.ord).map(toLine),
    justification: row.justification,
    returnInfo: row.returnInfo,
    levelEnteredOn: row.levelEnteredOn,
    createdOn: row.createdOn,
  };
}

export async function loadRequests(q: Queryable, ids?: readonly string[]): Promise<Request[]> {
  if (ids && ids.length === 0) return [];
  const rows = ids ? await q.select().from(requests).where(inArray(requests.id, [...ids])) : await q.select().from(requests);
  const lines = ids ? await q.select().from(requestLines).where(inArray(requestLines.requestId, [...ids])) : await q.select().from(requestLines);
  return rows.map((row) => toRequest(row, lines)).sort((a, b) => a.createdOn.localeCompare(b.createdOn) || a.id.localeCompare(b.id));
}

export async function loadRequest(q: Queryable, id: string): Promise<Request | null> {
  return (await loadRequests(q, [id]))[0] ?? null;
}

export async function loadLists(q: Queryable, ids?: readonly string[]): Promise<DailyList[]> {
  if (ids && ids.length === 0) return [];
  const rows = ids ? await q.select().from(dailyLists).where(inArray(dailyLists.id, [...ids])) : await q.select().from(dailyLists);
  const members = await q.select().from(dailyListRequests).orderBy(asc(dailyListRequests.ord));
  return rows.map((row) => ({
    id: row.id,
    level: row.level as Level,
    unitId: row.unitId,
    date: row.date,
    status: row.status,
    requestIds: members.filter((m) => m.listId === row.id).map((m) => m.requestId),
    formedBy: row.formedBy,
    sedoNumber: row.sedoNumber,
    approvedBy: row.approvedBy,
    revision: row.revision,
  }));
}

export async function loadList(q: Queryable, id: string): Promise<DailyList | null> {
  return (await loadLists(q, [id]))[0] ?? null;
}

/** Симульований поточний момент («Наступний день» зсуває його). */
export async function loadNow(q: Queryable): Promise<string> {
  const [row] = await q.select().from(demoState).where(eq(demoState.id, 1));
  if (!row) throw new Error("Демо-стан не ініціалізовано (потрібен seed).");
  return row.now;
}

export async function saveNow(q: Queryable, now: string): Promise<void> {
  await q.insert(demoState).values({ id: 1, now }).onConflictDoUpdate({ target: demoState.id, set: { now } });
}

/** Витяги по в/ч разом із рядками (статус рядка «Заміна погоджена» — лише з витягом). */
export async function loadExtracts(q: Queryable): Promise<Extract[]> {
  const [heads, lines] = await Promise.all([q.select().from(extracts).orderBy(asc(extracts.date), asc(extracts.id)), q.select().from(extractLines)]);
  return heads.map((head) => {
    const own = lines.filter((l) => l.extractId === head.id);
    return {
      id: head.id,
      unitId: head.unitId,
      date: head.date,
      requestIds: [...new Set(own.map((l) => l.requestId))],
      lines: own.map((l) => ({
        requestId: l.requestId,
        lineId: l.lineId,
        positionId: l.positionId,
        qty: l.qty,
        kind: l.kind,
        status: l.status as Extract["lines"][number]["status"],
      })),
    };
  });
}

/** Увесь журнал у порядку виконання: з нього рахуються дні на рівнях і частка повернень. */
export async function loadAllEvents(q: Queryable): Promise<JournalEvent[]> {
  return (await q.select({ data: journal.data }).from(journal).orderBy(asc(journal.seq))).map((r) => r.data);
}
