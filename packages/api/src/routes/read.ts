import { Hono } from "hono";
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
  type DspDb,
  type UserRow,
} from "@dsp/db";
import { DEFAULT_LEVELS } from "@dsp/domain";
import { budgetSummary, userView } from "../views.ts";
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

export async function sessionOf(db: DspDb, user: UserRow) {
  const [users, now] = await Promise.all([loadUsers(db), loadNow(db)]);
  return { user: userView(user), users: users.map(userView), today: now.slice(0, 10) };
}

/** Читання довідників і зведень: без змін стану, ключ ідемпотентності не потрібен. */
export function readRoutes(db: DspDb) {
  const app = new Hono<Env>();

  const directionFor = async (user: UserRow): Promise<string> => directionOf(await loadUnits(db), user.unitId ?? "");

  app.get("/api/session", async (c) => c.json(await sessionOf(db, c.get("user"))));

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
    const rows = user.unitId ? await loadProperty(db, user.unitId) : [];
    return c.json({ items: rows.map((r) => ({ id: r.id, unitId: r.unitId, tab: r.tab, qty: r.qty, item: itemView(r.item) })) });
  });

  app.get("/api/journal", async (c) =>
    c.json({ journal: (await db.select().from(journal).orderBy(desc(journal.seq)).limit(200)).map((j) => j.data) }),
  );

  return app;
}
