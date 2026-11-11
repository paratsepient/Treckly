import { Hono } from "hono";
import { API } from "@dsp/contract";
import { loadUser, loadUsers, type DspDb } from "@dsp/db";
import { DomainError, type IdGenerator } from "@dsp/domain";
import { ApiError, createCommandRunner, parseBody, STATUS, type Env } from "./http.ts";
import { readRoutes, sessionOf } from "./routes/read.ts";
import { requestRoutes } from "./routes/requests.ts";

export interface AppOptions {
  readonly db: DspDb;
  readonly ids: IdGenerator;
  /** «Скинути демо»: чиста схема і початковий стан (у браузері — `resetDemo` з @dsp/seed). */
  readonly resetDemo?: () => Promise<void>;
}

/**
 * Hono-застосунок: той самий код виконується в браузері (прототип) і на сервері (пілот).
 * Усі зміни — із `Idempotency-Key`; зміна стану, запис журналу й збереження ключа — в одній
 * транзакції. Тіла запитів перевіряються схемами `@dsp/contract`.
 *
 * Ролі: користувач передається заголовком `X-User-Id` (перемикач ролей без паролів); без
 * заголовка діє перший автор. Реалізовано сесію, довідники, майно та заявки автора;
 * переліки рівнів, затвердження й зведення додаються в ітераціях 3–4.
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
    c.set("user", user);
    await next();
  });

  app.route("/", readRoutes(db));
  app.route("/", requestRoutes(db, run));

  /** Сесія без стану: перемикач ролей лише повертає дані обраного користувача. */
  app.post("/api/session/role", async (c) => {
    const { userId } = await parseBody(c, API.switchRole.input);
    const user = await loadUser(db, userId);
    if (!user) throw new ApiError(404, "NOT_FOUND", `Невідомий користувач ${userId}.`);
    return c.json(await sessionOf(db, user));
  });

  app.post("/api/demo/reset", async (c) => {
    if (!options.resetDemo) throw new ApiError(404, "NOT_FOUND", "Скидання демо недоступне.");
    await options.resetDemo();
    return c.json(await sessionOf(db, c.get("user")));
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
