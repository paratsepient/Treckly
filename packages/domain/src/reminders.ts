import { daysBetween, toIsoDate } from "./clock.ts";
import { levelAudience, type DomainContext } from "./context.ts";
import type { Notification, Request } from "./types.ts";

/** Скільки днів заявка на поточному рівні (або чекає на автора після повернення). */
export function daysAtLevel(request: Request, today: string): number {
  return request.levelEnteredOn ? daysBetween(request.levelEnteredOn, today) : 0;
}

/**
 * «Наступний день»: щоденні нагадування тим, у кого заявки. У черзі — уповноваженій
 * особі, у сформованому переліку — керівнику, повернуті — автору.
 */
export function dailyReminders(ctx: DomainContext, requests: readonly Request[]): Notification[] {
  const now = ctx.clock.now();
  const today = toIsoDate(now);
  const at = now.toISOString();
  const result: Notification[] = [];
  for (const request of requests) {
    const note = `Днів на рівні: ${daysAtLevel(request, today)}`;
    if (request.status === "at_level" && request.level !== null) {
      result.push({ kind: "reminder", audience: levelAudience(request, request.level, "preparer"), requestId: request.id, listId: null, note, at });
    } else if (request.status === "in_list" && request.level !== null) {
      result.push({ kind: "reminder", audience: levelAudience(request, request.level, "approver"), requestId: request.id, listId: request.listId, note, at });
    } else if (request.status === "returned") {
      result.push({ kind: "reminder", audience: { kind: "author", userId: request.authorId }, requestId: request.id, listId: null, note, at });
    }
  }
  return result;
}
