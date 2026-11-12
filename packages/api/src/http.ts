import { eq } from "drizzle-orm";
import type { Context } from "hono";
import type { z } from "zod";
import { idempotencyKeys, loadNow, type DspDb, type DspTx, type UserRow } from "@dsp/db";
import {
  createManualClock,
  DomainError,
  type Actor,
  type DomainContext,
  type DomainErrorCode,
  type IdGenerator,
  type Meta,
} from "@dsp/domain";

export const STATUS: Record<DomainErrorCode, 403 | 409 | 422> = {
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

/** Помилка транспорту (не домену): некоректний запит або відсутній запис. */
export class ApiError extends Error {
  readonly status: 400 | 404;
  readonly code: "VALIDATION" | "NOT_FOUND";
  readonly details: unknown;

  constructor(status: 400 | 404, code: "VALIDATION" | "NOT_FOUND", message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface Env {
  Variables: { user: UserRow };
}

export interface Reply {
  readonly status: number;
  readonly body: unknown;
}

/** Тіло запиту, перевірене схемою контракту. */
export async function parseBody<S extends z.ZodType>(c: Context<Env>, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new ApiError(400, "VALIDATION", "Тіло запиту не є коректним JSON.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new ApiError(400, "VALIDATION", "Некоректне тіло запиту.", parsed.error.issues);
  return parsed.data;
}

/** Користувач, від імені якого діє команда. Адміністратор демо дій над заявками не виконує. */
export function actorOf(user: UserRow): Actor {
  if (user.roleKind === "author" && user.unitId) return { userId: user.id, role: { kind: "author", unitId: user.unitId } };
  if ((user.roleKind === "preparer" || user.roleKind === "approver") && user.unitId && user.level) {
    return { userId: user.id, role: { kind: user.roleKind, level: user.level as 1 | 2 | 3 | 4 | 5, unitId: user.unitId } };
  }
  if (user.roleKind === "admin") return { userId: user.id, role: { kind: "admin" } };
  throw new DomainError("FORBIDDEN_ROLE", "Ця роль не виконує дій над заявками.", { role: user.roleKind });
}

export function metaOf(c: Context<Env>, expectedRevisions?: Record<string, number>): Meta {
  return {
    actor: actorOf(c.get("user")),
    idempotencyKey: c.req.header("idempotency-key") ?? "",
    ...(expectedRevisions ? { expectedRevisions } : {}),
  };
}

/** Контекст домену: «сьогодні» — з симульованого часу в базі, а не з системного годинника. */
export async function domainContext(q: Parameters<typeof loadNow>[0], ids: IdGenerator): Promise<DomainContext> {
  return { clock: createManualClock(await loadNow(q)), ids };
}

/**
 * Виконує команду в одній транзакції: зміна стану, журнал і збереження відповіді за
 * ключем ідемпотентності. Повторний запит із тим самим ключем повертає ту саму відповідь.
 */
export function createCommandRunner(db: DspDb, ids: IdGenerator) {
  return async function run(key: string | undefined, handler: (tx: DspTx, ctx: DomainContext) => Promise<Reply>): Promise<Reply> {
    if (!key) throw new ApiError(400, "VALIDATION", "Потрібен заголовок Idempotency-Key.");
    return db.transaction(async (tx) => {
      const [saved] = await tx.select().from(idempotencyKeys).where(eq(idempotencyKeys.key, key));
      if (saved) return { status: saved.status, body: saved.response };
      const reply = await handler(tx, await domainContext(tx, ids));
      await tx.insert(idempotencyKeys).values({ key, status: reply.status, response: reply.body });
      return reply;
    });
  };
}

export type CommandRunner = ReturnType<typeof createCommandRunner>;
