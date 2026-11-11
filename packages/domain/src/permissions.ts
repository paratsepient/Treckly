import { DomainError } from "./errors.ts";
import type { Actor, Level, Request, UnitId } from "./types.ts";
import { isAuthor } from "./context.ts";

export function assertAuthor(actor: Actor, request: Request): void {
  if (!isAuthor(actor, request)) {
    throw new DomainError("FORBIDDEN_ROLE", "Цю дію виконує лише автор заявки.", { requestId: request.id });
  }
}

export function assertLevelRole(actor: Actor, kind: "preparer" | "approver", level: Level, unitId: UnitId): void {
  const role = actor.role;
  if (role.kind !== kind || role.level !== level || role.unitId !== unitId) {
    throw new DomainError("FORBIDDEN_ROLE", "Немає права на цю дію на цьому рівні й у цьому підрозділі.", {
      required: { kind, level, unitId },
    });
  }
}

export function assertSystem(actor: Actor): void {
  if (actor.role.kind !== "system") {
    throw new DomainError("FORBIDDEN_ROLE", "Цю дію виконує лише система.");
  }
}
