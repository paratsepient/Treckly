import { DomainError } from "./errors.ts";
import type { UserId } from "./types.ts";

/**
 * ТВО — тимчасове виконання обов'язків. Адміністратор призначає заступника замість уповноваженої особи
 * чи керівника рівня; поки призначення чинне, заступник діє з повноваженнями того, кого заміщає,
 * а журнал записує «ТВО за …». Зняте призначення повноважень більше не дає.
 */
export interface ActingAssignment {
  readonly id: string;
  /** Хто тимчасово виконує обов'язки. */
  readonly deputyId: UserId;
  /** Чиї обов'язки виконує. */
  readonly principalId: UserId;
  readonly assignedBy: UserId;
  readonly assignedAt: string;
  readonly revokedAt: string | null;
}

export interface ActingPerson {
  readonly id: UserId;
  readonly roleKind: "author" | "preparer" | "approver" | "admin";
}

export const isActive = (a: ActingAssignment): boolean => a.revokedAt === null;

/** Перевірка призначення: заміщають лише рівні погодження; одна особа — одне призначення в кожен бік. */
export function assertAssignable(principal: ActingPerson, deputy: ActingPerson, assignments: readonly ActingAssignment[]): void {
  const invalid = (message: string, reason: string) => new DomainError("INVALID_TRANSITION", message, { reason });
  if (principal.roleKind !== "preparer" && principal.roleKind !== "approver") {
    throw invalid("ТВО призначають лише замість уповноваженої особи чи керівника рівня.", "PRINCIPAL_ROLE");
  }
  if (deputy.id === principal.id) throw invalid("Особа не може виконувати обов'язки сама за себе.", "SAME_PERSON");
  if (deputy.roleKind === "admin") throw invalid("Адміністратор не виконує обов'язків на рівнях погодження.", "DEPUTY_ROLE");
  const active = assignments.filter(isActive);
  if (active.some((a) => a.principalId === principal.id)) throw invalid("Для цієї особи ТВО вже призначено.", "PRINCIPAL_BUSY");
  if (active.some((a) => a.deputyId === deputy.id)) throw invalid("Ця особа вже виконує чиїсь обов'язки.", "DEPUTY_BUSY");
  if (active.some((a) => a.principalId === deputy.id)) throw invalid("Ця особа сама зараз заміщена.", "DEPUTY_ABSENT");
}

/** Чинне призначення, за яким особа діє як ТВО (або null). */
export const actingOf = (userId: UserId, assignments: readonly ActingAssignment[]): ActingAssignment | null =>
  assignments.find((a) => isActive(a) && a.deputyId === userId) ?? null;
