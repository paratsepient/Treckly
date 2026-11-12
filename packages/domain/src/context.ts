import type { Clock } from "./clock.ts";
import { toIsoDate } from "./clock.ts";
import { DomainError } from "./errors.ts";
import type { Audience, Actor, IsoDate, IsoTimestamp, JournalEvent, Level, Meta, Request, EventType, RequestStatus } from "./types.ts";

/** Генератор ідентифікаторів: домен сам випадкових значень не створює. */
export interface IdGenerator {
  next(prefix: string): string;
}

export function createSequentialIds(): IdGenerator {
  const counters = new Map<string, number>();
  return {
    next(prefix) {
      const n = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, n);
      return `${prefix}-${String(n).padStart(4, "0")}`;
    },
  };
}

export interface DomainContext {
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export function stamp(ctx: DomainContext): { at: IsoTimestamp; today: IsoDate } {
  const now = ctx.clock.now();
  return { at: now.toISOString(), today: toIsoDate(now) };
}

/** Оптимістичне блокування: якщо клієнт бачив старішу версію запису — VERSION_CONFLICT. */
export function guardRevision(meta: Meta, entity: { readonly id: string; readonly revision: number }): void {
  const expected = meta.expectedRevisions?.[entity.id];
  if (expected !== undefined && expected !== entity.revision) {
    throw new DomainError("VERSION_CONFLICT", "Запис змінено іншою дією. Оновіть сторінку.", {
      id: entity.id,
      expected,
      actual: entity.revision,
    });
  }
}

export function bumped<T extends { readonly revision: number }>(entity: T, patch: Partial<T>): T {
  return { ...entity, ...patch, revision: entity.revision + 1 };
}

export interface EventInit {
  readonly type: EventType;
  readonly requestId?: string | null;
  readonly listId?: string | null;
  readonly from?: RequestStatus | null;
  readonly to?: RequestStatus | null;
  readonly requestVersion?: number | null;
  readonly revision?: number | null;
  readonly data?: Readonly<Record<string, unknown>>;
}

export function makeEvent(ctx: DomainContext, meta: Meta, init: EventInit): JournalEvent {
  return {
    type: init.type,
    at: stamp(ctx).at,
    actorId: meta.actor.userId,
    idempotencyKey: meta.idempotencyKey,
    requestId: init.requestId ?? null,
    listId: init.listId ?? null,
    from: init.from ?? null,
    to: init.to ?? null,
    requestVersion: init.requestVersion ?? null,
    revision: init.revision ?? null,
    // ТВО: у журналі видно, чиї обов'язки виконувала особа.
    data: meta.actor.actingFor ? { ...(init.data ?? {}), actingFor: meta.actor.actingFor } : (init.data ?? {}),
  };
}

export function levelAudience(request: Request, level: Level, role: "preparer" | "approver" | "both"): Audience {
  return { kind: "level", level, unitId: request.route[level - 1] as string, role };
}

export function isAuthor(actor: Actor, request: Request): boolean {
  return actor.role.kind === "author" && actor.userId === request.authorId;
}
