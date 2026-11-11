import { Hono } from "hono";
import { API } from "@dsp/contract";
import { loadNotifications, loadNow, markNotificationsRead, type DspDb, type Reader, type UserRow } from "@dsp/db";
import { parseBody, type Env } from "../http.ts";

const readerOf = (user: UserRow): Reader => ({ userId: user.id, roleKind: user.roleKind, level: user.level, unitId: user.unitId });

/** Сповіщення в системі: кожна роль бачить лише адресовані їй (автор — собі, роль рівня — своєму підрозділу). */
export function inboxRoutes(db: DspDb) {
  const app = new Hono<Env>();

  app.get("/api/notifications", async (c) => c.json({ notifications: await loadNotifications(db, readerOf(c.get("user"))) }));

  app.post("/api/notifications/read", async (c) => {
    const { ids } = await parseBody(c, API.markRead.input);
    await markNotificationsRead(db, readerOf(c.get("user")), await loadNow(db), ids);
    return c.json({ ok: true as const });
  });

  return app;
}
