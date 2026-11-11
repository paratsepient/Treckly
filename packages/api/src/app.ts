import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { journal, loadRequest, requests, idempotencyKeys, saveOutcome, type DspDb, type DspTx } from "@dsp/db";
import {
  createDraft,
  DomainError,
  editLines,
  type Actor,
  type DomainContext,
  type DomainErrorCode,
  type Meta,
  type RequestLine,
  type Route,
} from "@dsp/domain";

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

export interface AppOptions {
  readonly db: DspDb;
  readonly ctx: DomainContext;
  /** Маршрут нових заявок (етап 0: фіксований). */
  readonly route: Route;
}

interface Reply {
  readonly status: number;
  readonly body: unknown;
}

/**
 * Hono-застосунок: той самий код виконується в браузері (прототип) і на сервері (пілот).
 * Усі зміни — POST з `Idempotency-Key`; зміна стану, запис журналу й збереження ключа —
 * в одній транзакції.
 */
export function createApp(options: AppOptions) {
  const { db, ctx } = options;
  const app = new Hono();

  app.onError((error, c) => {
    if (error instanceof DomainError) {
      return c.json({ error: { code: error.code, message: error.message, details: error.details } }, STATUS[error.code]);
    }
    console.error(error);
    return c.json({ error: { code: "INTERNAL", message: "Внутрішня помилка" } }, 500);
  });

  /** Етап 0: роль — заголовок X-Actor (перемикач ролей без паролів). */
  const actorOf = (header: string | undefined): Actor => {
    if (!header) throw new DomainError("FORBIDDEN_ROLE", "Не вказано роль (X-Actor).");
    return JSON.parse(header) as Actor;
  };

  const command = async (key: string | undefined, handler: (tx: DspTx) => Promise<Reply>): Promise<Reply> => {
    if (!key) throw new DomainError("INVALID_TRANSITION", "Потрібен заголовок Idempotency-Key.", { reason: "IDEMPOTENCY_KEY_REQUIRED" });
    return db.transaction(async (tx) => {
      const [saved] = await tx.select().from(idempotencyKeys).where(eq(idempotencyKeys.key, key));
      if (saved) return { status: saved.status, body: saved.response };
      const reply = await handler(tx);
      await tx.insert(idempotencyKeys).values({ key, status: reply.status, response: reply.body });
      return reply;
    });
  };

  const metaOf = (c: { req: { header(name: string): string | undefined } }, expected?: Record<string, number>): Meta => ({
    actor: actorOf(c.req.header("x-actor")),
    idempotencyKey: c.req.header("idempotency-key") ?? "",
    ...(expected ? { expectedRevisions: expected } : {}),
  });

  app.post("/api/requests", async (c) => {
    const { lines } = await c.req.json<{ lines: RequestLine[] }>();
    const meta = metaOf(c);
    const reply = await command(meta.idempotencyKey, async (tx) => {
      const outcome = createDraft(ctx, meta, { route: options.route, lines });
      await saveOutcome(tx, outcome);
      return { status: 201, body: { request: outcome.requests[0] } };
    });
    return c.json(reply.body, reply.status as 201);
  });

  app.post("/api/requests/:id/lines", async (c) => {
    const id = c.req.param("id");
    const { lines, expectedRevision } = await c.req.json<{ lines: RequestLine[]; expectedRevision: number }>();
    const meta = metaOf(c, { [id]: expectedRevision });
    const reply = await command(meta.idempotencyKey, async (tx) => {
      const request = await loadRequest(tx, id);
      if (!request) return { status: 404, body: { error: { code: "NOT_FOUND", message: "Заявку не знайдено" } } };
      const outcome = editLines(ctx, meta, { request, lines });
      await saveOutcome(tx, outcome);
      return { status: 200, body: { request: outcome.requests[0] } };
    });
    return c.json(reply.body, reply.status as 200);
  });

  /** Лише для перевірки відкату: записує журнал і кидає помилку. */
  app.post("/api/spike/fail", async (c) => {
    const meta = metaOf(c);
    const reply = await command(meta.idempotencyKey, async (tx) => {
      await tx.insert(journal).values({
        at: new Date(0).toISOString(),
        type: "request.created",
        actorId: meta.actor.userId,
        idempotencyKey: meta.idempotencyKey,
        data: {} as never,
      });
      throw new Error("навмисний збій після запису");
    });
    return c.json(reply.body, reply.status as 200);
  });

  app.get("/api/requests", async (c) => c.json({ requests: (await db.select().from(requests)).map((r) => r.body) }));
  app.get("/api/journal", async (c) => c.json({ journal: await db.select().from(journal).orderBy(desc(journal.seq)) }));

  return app;
}

/**
 * Транспорт «в браузері»: fetch-сумісна функція, що викликає Hono напряму, без мережі.
 * На пілоті її замінює звичайний `fetch` на адресу сервера.
 */
export function createInProcessFetch(app: ReturnType<typeof createApp>): typeof fetch {
  return (input, init) => Promise.resolve(app.fetch(new Request(input, init)));
}
