import { Hono } from "hono";
import { kekvAllowed } from "./users.ts";
import { desc } from "drizzle-orm";
import {
  directionOf,
  journal,
  loadBudget,
  loadItems,
  loadKekv,
  loadNow,
  loadPositions,
  loadProperty,
  loadRequests,
  loadUnits,
  loadUsers,
  loadUser,
  loadActing,
  type DspDb,
  type Queryable,
  type UserRow,
} from "@dsp/db";
import { budgetSummary, userView } from "../views.ts";
import { actingOf, DEFAULT_LEVELS, DomainError } from "@dsp/domain";
import type { Env } from "../http.ts";

const itemView = (i: Awaited<ReturnType<typeof loadItems>>[number]) => ({
  id: i.id,
  code: i.code,
  name: i.name,
  kekv: i.kekv,
  priceMinor: i.priceMinor,
  measure: i.measure,
  group: i.groupKey,
});

/** ТВО: поки призначення чинне, особа діє з роллю того, кого заміщає; посада — «ТВО: …». */
export async function effectiveUser(q: Queryable, user: UserRow): Promise<{ user: UserRow; actingFor: string | null }> {
  const assignment = actingOf(user.id, await loadActing(q));
  const principal = assignment ? await loadUser(q, assignment.principalId) : null;
  if (!assignment || !principal) return { user, actingFor: null };
  return { user: { ...user, roleKind: principal.roleKind, level: principal.level, unitId: principal.unitId, title: `ТВО: ${principal.title}` }, actingFor: principal.id };
}

export async function sessionOf(db: Queryable, user: UserRow, actingFor: string | null = null) {
  const [users, now] = await Promise.all([loadUsers(db), loadNow(db)]);
  return { user: userView(user), users: users.map(userView), today: now.slice(0, 10), actingFor };
}

/** Читання довідників і зведень: без змін стану, ключ ідемпотентності не потрібен. */
export function readRoutes(db: DspDb) {
  const app = new Hono<Env>();

  const directionFor = async (user: UserRow): Promise<string> => directionOf(await loadUnits(db), user.unitId ?? "");

  app.get("/api/session", async (c) => c.json(await sessionOf(db, c.get("user"), c.get("actingFor"))));

  app.get("/api/reference", async (c) => {
    const [units, kekv, items] = await Promise.all([loadUnits(db), loadKekv(db), loadItems(db)]);
    return c.json({ units, kekv, items: items.map(itemView), levels: DEFAULT_LEVELS });
  });

  app.get("/api/positions", async (c) => {
    const positions = await loadPositions(db, await directionFor(c.get("user")));
    return c.json({ positions: Object.values(positions) });
  });

  app.get("/api/budget", async (c) => {
    const direction = await directionFor(c.get("user"));
    const [budget, requests, positions] = await Promise.all([loadBudget(db, direction), loadRequests(db), loadPositions(db, direction)]);
    return c.json(budgetSummary(budget, requests, positions));
  });

  app.get("/api/property", async (c) => {
    const user = c.get("user");
    // Майно й план особи — лише за доступними їй КЕКВ (налаштування адміністратора).
    const rows = (user.unitId ? await loadProperty(db, user.unitId) : []).filter((r) => kekvAllowed(user, r.item.kekv));
    return c.json({ items: rows.map((r) => ({ id: r.id, unitId: r.unitId, tab: r.tab, qty: r.qty, item: itemView(r.item) })) });
  });

  app.get("/api/units/:id/property", async (c) => {
    const user = c.get("user");
    const unitId = c.req.param("id");
    // Автор бачить майно лише своєї в/ч; рівні погодження й адміністратор — будь-якої в/ч заявки.
    if (user.roleKind === "author" && user.unitId !== unitId) {
      throw new DomainError("FORBIDDEN_ROLE", "Автор бачить майно лише своєї в/ч.", { unitId });
    }
    const rows = await loadProperty(db, unitId);
    return c.json({ items: rows.map((r) => ({ id: r.id, unitId: r.unitId, tab: r.tab, qty: r.qty, item: itemView(r.item) })) });
  });

  app.get("/api/journal", async (c) =>
    c.json({ journal: (await db.select().from(journal).orderBy(desc(journal.seq)).limit(200)).map((j) => j.data) }),
  );

  return app;
}
