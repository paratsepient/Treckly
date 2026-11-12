import { buildTrack } from "./track.ts";
import type { IsoDate, JournalEvent, Request, RequestStatus } from "./types.ts";

export interface Kpi {
  /** Кількість заявок за статусами (усі статуси присутні, навіть нульові). */
  readonly byStatus: Readonly<Record<RequestStatus, number>>;
  /** Середня кількість днів на рівні (ключі "1"…"5"); 0 — даних ще немає. */
  readonly avgDaysByLevel: Readonly<Record<string, number>>;
  /** Частка заявок, які хоч раз повертали, серед поданих (0…1). */
  readonly returnShare: number;
}

const STATUSES: readonly RequestStatus[] = ["draft", "at_level", "in_list", "returned", "approved", "extract_issued", "procured", "issued", "not_procured", "withdrawn"];

/**
 * Зведення для реєстру: заявки за статусами, середні дні на рівнях і частка повернень.
 * Дні беруться з треку (пройдені рівні й поточний), тож лічильник збігається з тим, що
 * бачить автор у «Моїх заявках».
 */
export function computeKpi(requests: readonly Request[], events: readonly JournalEvent[], today: IsoDate): Kpi {
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<RequestStatus, number>;
  for (const r of requests) byStatus[r.status] += 1;

  const eventsByRequest = new Map<string, JournalEvent[]>();
  for (const e of events) {
    if (e.requestId) eventsByRequest.set(e.requestId, [...(eventsByRequest.get(e.requestId) ?? []), e]);
  }

  const sums = new Map<number, { total: number; count: number }>();
  for (const r of requests) {
    for (const step of buildTrack(r, eventsByRequest.get(r.id) ?? [], today)) {
      if ((step.state !== "done" && step.state !== "current") || step.daysAtLevel === null) continue;
      const acc = sums.get(step.level) ?? { total: 0, count: 0 };
      sums.set(step.level, { total: acc.total + step.daysAtLevel, count: acc.count + 1 });
    }
  }
  const avgDaysByLevel = Object.fromEntries([1, 2, 3, 4, 5].map((l) => [String(l), round1(sums.has(l) ? (sums.get(l)!.total / sums.get(l)!.count) : 0)]));

  const submitted = new Set(events.filter((e) => e.type === "request.submitted").map((e) => e.requestId));
  const returned = new Set(events.filter((e) => e.type === "request.returned").map((e) => e.requestId));
  const returnShare = submitted.size === 0 ? 0 : [...returned].filter((id) => submitted.has(id)).length / submitted.size;

  return { byStatus, avgDaysByLevel, returnShare };
}

const round1 = (n: number): number => Math.round(n * 10) / 10;
