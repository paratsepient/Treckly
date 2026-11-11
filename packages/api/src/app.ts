import { Hono } from "hono";
import { desc } from "drizzle-orm";
import { API } from "@dsp/contract";
import { idempotencyKeys, journal, loadRequest, loadRequests, saveOutcome, type DspDb, type DspTx } from "@dsp/db";
import {
  createDraft,
  DomainError,
  editLines,
  type Actor,
  type DomainContext,
  type DomainErrorCode,
  type Meta,
  type Route,
} from "@dsp/domain";
import { eq } from "drizzle-orm";

const STATUS: Record<DomainErrorCode, 403 | 409 | 422> = {
  NOT_IN_LIST: 422,
  QTY_EXCEEDED: 422,
  KEKV_MISMATCH: 422,
  BUDGET_EXCEEDED: 422,
  INVALID_TRANSITION: 409,
  FORBIDDEN_ROLE: 403,
  VERSION_CONFLICT: 409,
  SEDO_NUMBER_INVALID: 422,
  NOTE_REQUIRED: 422,
};

/** Помилка транспорту (не домену): некоректний запит. */
class ApiError extends Error {
  readonly status: 400;
  readonly code: "VALIDATION";
  readonly details: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.status = 400;
    this.code = "VALIDATION";
    this.details = details;
  }
}

export interface AppOptions {
  readonly db: DspDb;
  readonly ctx: DomainContext;
  readonly directionId: string;
  /** Маршрут нових заявок (поки фіксований; далі — за автором). */
  readonly route: Route;
}

interface Reply {
  readonly status: number;
  readonly body: unknown;
}

/**
 * Hono-застосунок: той самий код виконується в браузері (прототип) і на сервері (пілот).
 * Усі зміни — із `Idempotency-Key`; зміна стану, запис журналу й збереження ключа — в одній
 * транзакції. Тіла запитів перевіряються схемами `@dsp/contract`.
 *
 * Зараз реалізовано каркас і перші маршрути (створення й редагування заявки, читання);
 * решту операцій з реєстру `API` додаємо в ітераціях 2–4.
 */
export function createApp(options: AppOptions) {
  const { db, ctx } = options;
  const app = new Hono();

  app.onError((error, c) => {
    if (error instanceof ApiError) {
      return c.json({ error: { code: error.code, message: error.message, details: { issues: error.details } } }, error.status);
    }
    if (error instanceof DomainError) {
      return c.json({ error: { code: error.code, message: error.message, details: error.details } }, STATUS[error.code]);
    }
    console.error(error);
    return c.json({ error: { code: "INTERNAL", message: "Внутрішня помилка" } }, 500);
  });

  /** Поки роль — заголовок X-Actor (перемикач ролей без паролів). */
  const actorOf = (header: string | undefined): Actor => {
    if (!header) throw new DomainError("FORBIDDEN_ROLE", "Не вказано роль (X-Actor).");
    return JSON.parse(header) as Actor;
  };

  const command = async (key: string | undefined, handler: (tx: DspTx) => Promise<Reply>): Promise<Reply> => {
    if (!key) throw new ApiError("Потрібен заголовок Idempotency-Key.");
    return db.transaction(async (tx) => {
      const [saved] = await tx.select().from(idempotencyKeys).where(eq(idempotencyKeys.key, key));
      if (saved) return { status: saved.status, body: saved.response };
      const reply = await handler(tx);
      await tx.insert(idempotencyKeys).values({ key, status: reply.status, response: reply.body });
      return reply;
    });
  };

  const metaOf = (header: (name: string) => string | undefined, expected?: Record<string, number>): Meta => ({
    actor: actorOf(header("x-actor")),
    idempotencyKey: header("idempotency-key") ?? "",
    ...(expected ? { expectedRevisions: expected } : {}),
  });

  app.post("/api/requests", async (c) => {
    const parsed = API.createRequest.input.safeParse(await c.req.json());
    if (!parsed.success) throw new ApiError("Некоректне тіло запиту.", parsed.error.issues);
    const meta = metaOf((n) => c.req.header(n));
    const reply = await command(meta.idempotencyKey, async (tx) => {
      const outcome = createDraft(ctx, meta, { route: options.route, lines: parsed.data.lines });
      await saveOutcome(tx, outcome, options.directionId);
      return { status: 201, body: { request: outcome.requests[0] } };
    });
    return c.json(reply.body, reply.status as 201);
  });

  app.put("/api/requests/:id/lines", async (c) => {
    const id = c.req.param("id");
    const parsed = API.editLines.input.safeParse(await c.req.json());
    if (!parsed.success) throw new ApiError("Некоректне тіло запиту.", parsed.error.issues);
    const meta = metaOf((n) => c.req.header(n), { [id]: parsed.data.expectedRevision });
    const reply = await command(meta.idempotencyKey, async (tx) => {
      const request = await loadRequest(tx, id);
      if (!request) return { status: 404, body: { error: { code: "NOT_FOUND", message: "Заявку не знайдено" } } };
      const outcome = editLines(ctx, meta, { request, lines: parsed.data.lines });
      await saveOutcome(tx, outcome, options.directionId);
      return { status: 200, body: { request: outcome.requests[0] } };
    });
    return c.json(reply.body, reply.status as 200);
  });

  app.get("/api/requests", async (c) => c.json({ requests: await loadRequests(db) }));
  app.get("/api/journal", async (c) => c.json({ journal: (await db.select().from(journal).orderBy(desc(journal.seq))).map((j) => j.data) }));

  return app;
}

/**
 * Транспорт «в браузері»: fetch-сумісна функція, що викликає Hono напряму, без мережі.
 * На пілоті її замінює звичайний `fetch` на адресу сервера.
 */
export function createInProcessFetch(app: ReturnType<typeof createApp>): typeof fetch {
  return (input, init) => Promise.resolve(app.fetch(new Request(input, init)));
}
