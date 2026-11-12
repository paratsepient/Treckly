import { asc, eq } from "drizzle-orm";
import type { ActingAssignment, JournalEvent, Route } from "@dsp/domain";
import type { Queryable } from "./client.ts";
import { acting, journal, kekv, nomenclature, propertyItems, units, users } from "./schema.ts";

export type UnitRow = typeof units.$inferSelect;
export type UserRow = typeof users.$inferSelect;

export const loadUsers = (q: Queryable): Promise<UserRow[]> => q.select().from(users).orderBy(asc(users.id));
export const loadUnits = (q: Queryable): Promise<UnitRow[]> => q.select().from(units);
export const loadKekv = (q: Queryable) => q.select().from(kekv).orderBy(asc(kekv.code));
export const loadItems = (q: Queryable) => q.select().from(nomenclature).orderBy(asc(nomenclature.code));

export async function loadUser(q: Queryable, id: string): Promise<UserRow | null> {
  const [row] = await q.select().from(users).where(eq(users.id, id));
  return row ?? null;
}

/** «Моє майно» в/ч з назвою й ціною предмета. */
export async function loadProperty(q: Queryable, unitId: string) {
  return q
    .select({ id: propertyItems.id, unitId: propertyItems.unitId, tab: propertyItems.tab, qty: propertyItems.qty, item: nomenclature })
    .from(propertyItems)
    .innerJoin(nomenclature, eq(nomenclature.id, propertyItems.itemId))
    .where(eq(propertyItems.unitId, unitId))
    .orderBy(asc(nomenclature.code));
}

/** Журнал однієї заявки в порядку виконання. */
export async function loadRequestJournal(q: Queryable, requestId: string): Promise<JournalEvent[]> {
  const rows = await q.select({ data: journal.data }).from(journal).where(eq(journal.requestId, requestId)).orderBy(asc(journal.seq));
  return rows.map((r) => r.data);
}

/**
 * Маршрут заявки з ієрархії підрозділів: в/ч → бригада → РУ → напрямок → Відділ і Голова.
 * Кожен підрозділ дає наступний рівень через `parentId`; ланцюжок має мати рівно 5 ланок.
 */
export function routeFor(allUnits: readonly UnitRow[], unitId: string): Route {
  const byId = new Map(allUnits.map((u) => [u.id, u]));
  const chain: string[] = [];
  for (let cur = byId.get(unitId); cur && chain.length < 5; cur = cur.parentId ? byId.get(cur.parentId) : undefined) {
    chain.push(cur.id);
  }
  if (chain.length !== 5) throw new Error(`Підрозділ ${unitId} не має повного маршруту з 5 рівнів (знайдено ${chain.length})`);
  return chain as unknown as Route;
}

/**
 * Напрямок підрозділу: найближчий предок типу `direction`. Для органу вище напрямків
 * (Відділ і Голова) береться єдиний напрямок прототипу.
 */
export function directionOf(allUnits: readonly UnitRow[], unitId: string): string {
  const byId = new Map(allUnits.map((u) => [u.id, u]));
  for (let cur = byId.get(unitId); cur; cur = cur.parentId ? byId.get(cur.parentId) : undefined) {
    if (cur.kind === "direction") return cur.id;
  }
  const only = allUnits.find((u) => u.kind === "direction");
  if (!only) throw new Error("У структурі немає напрямку");
  return only.id;
}

/** Призначення ТВО (чинні й зняті), найновіші першими. */
export async function loadActing(q: Queryable): Promise<ActingAssignment[]> {
  const rows = await q.select().from(acting);
  return rows.sort((a, b) => b.assignedAt.localeCompare(a.assignedAt) || b.id.localeCompare(a.id));
}
