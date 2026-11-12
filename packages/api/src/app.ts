import { actingRoutes } from "./routes/acting.ts";
import { Hono } from "hono";
import { API } from "@dsp/contract";
import { loadNow, loadRequests, loadUser, loadUsers, saveNotifications, saveNow, type DspDb } from "@dsp/db";
import { createManualClock, dailyReminders, DomainError, type IdGenerator } from "@dsp/domain";
import { ApiError, createCommandRunner, metaOf, parseBody, STATUS, type Env } from "./http.ts";
import { inboxRoutes } from "./routes/inbox.ts";
import { levelRoutes } from "./routes/levels.ts";
import { summaryRoutes } from "./routes/summary.ts";
import { effectiveUser, readRoutes, sessionOf } from "./routes/read.ts";
import { requestRoutes } from "./routes/requests.ts";

export interface AppOptions {
  readonly db: DspDb;
  readonly ids: IdGenerator;
  /** «Скинути демо»: чиста схема і початковий стан (у браузері — `resetDemo` з @dsp/seed). */
  readonly resetDemo?: (options: { withExamples: boolean }) => Promise<void>;
}

/**
 * Hono-застосунок: той самий код виконується в браузері (прототип) і на сервері (пілот).
 * Усі зміни — із `Idempotency-Key`; зміна стану, запис журналу й збереження ключа — в одній
 * транзакції. Тіла запитів перевіряються схемами `@dsp/contract`.
 *
 * Ролі: користувач передається заголовком `X-User-Id` (перемикач ролей без паролів); без
 * заголовка діє перший автор. Реалізовано сесію, довідники, майно, заявки автора, чергу рівня,
 * денні переліки, затвердження, сповіщення, «Наступний день», остаточний перелік, витяги й зведення.
 */
export function createApp(options: AppOptions) {
  const { db } = options;
  const run = createCommandRunner(db, options.ids);
  const app = new Hono<Env>();

  app.onError((error, c) => {
    if (error instanceof ApiError) {
      const details = error.code === "VALIDATION" ? { issues: error.details } : ((error.details ?? {}) as Record<string, unknown>);
      return c.json({ error: { code: error.code, message: error.message, details } }, error.status);
    }
    if (error instanceof DomainError) {
      return c.json({ error: { code: error.code, message: error.message, details: error.details } }, STATUS[error.code]);
    }
    console.error(error);
    return c.json({ error: { code: "INTERNAL", message: "Внутрішня помилка" } }, 500);
  });

  app.use("/api/*", async (c, next) => {
    const id = c.req.header("x-user-id");
    const user = id ? await loadUser(db, id) : ((await loadUsers(db)).find((u) => u.roleKind === "author") ?? null);
    if (!user) throw new ApiError(400, "VALIDATION", id ? `Невідомий користувач ${id}.` : "У базі немає користувачів.");
    const effective = await effectiveUser(db, user);
    c.set("user", effective.user);
    c.set("actingFor", effective.actingFor);
    await next();
  });

  app.route("/", readRoutes(db));
  app.route("/", actingRoutes(db, run));
  app.route("/", requestRoutes(db, run));
  app.route("/", levelRoutes(db, run));
  app.route("/", inboxRoutes(db));
  app.route("/", summaryRoutes(db));

  /** Сесія без стану: перемикач ролей лише повертає дані обраного користувача. */
  app.post("/api/session/role", async (c) => {
    const { userId } = await parseBody(c, API.switchRole.input);
    const user = await loadUser(db, userId);
    if (!user) throw new ApiError(404, "NOT_FOUND", `Невідомий користувач ${userId}.`);
    const effective = await effectiveUser(db, user);
    return c.json(await sessionOf(db, effective.user, effective.actingFor));
  });

  /**
   * «Наступний день»: демо-дата зсувається на добу, а всім, у кого є заявки, надходять
   * щоденні нагадування (з лічильником днів на рівні).
   */
  app.post("/api/demo/next-day", async (c) => {
    const meta = metaOf(c);
    const reply = await run(meta.idempotencyKey, async (tx) => {
      const next = new Date(Date.parse(await loadNow(tx)) + 86_400_000).toISOString();
      await saveNow(tx, next);
      await saveNotifications(tx, dailyReminders({ clock: createManualClock(next), ids: options.ids }, await loadRequests(tx)));
      return { status: 200, body: await sessionOf(tx, c.get("user"), c.get("actingFor")) };
    });
    return c.json(reply.body, reply.status as 200);
  });

  app.post("/api/demo/reset", async (c) => {
    if (!options.resetDemo) throw new ApiError(404, "NOT_FOUND", "Скидання демо недоступне.");
    const text = await c.req.text();
    const parsed = API.resetDemo.input.safeParse(text.trim() === "" ? {} : JSON.parse(text));
    if (!parsed.success) throw new ApiError(400, "VALIDATION", "Некоректне тіло запиту.", parsed.error.issues);
    await options.resetDemo({ withExamples: parsed.data.withExamples ?? false });
    return c.json(await sessionOf(db, c.get("user"), c.get("actingFor")));
  });

  return app;
}

/**
 * Транспорт «в браузері»: fetch-сумісна функція, що викликає Hono напряму, без мережі.
 * На пілоті її замінює звичайний `fetch` на адресу сервера.
 */
export function createInProcessFetch(app: ReturnType<typeof createApp>): typeof fetch {
  return (input, init) => Promise.resolve(app.fetch(new Request(input, init)));
}
