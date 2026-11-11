import type { IsoDate } from "./types.ts";

/**
 * Годинник. Домен ніколи не читає системний час: «Наступний день» у демо-панелі
 * просто зсуває цей годинник.
 */
export interface Clock {
  now(): Date;
}

export interface ManualClock extends Clock {
  advanceDays(days: number): void;
  set(date: Date | string): void;
}

export function toIsoDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

/** Годинник із явним керуванням: для тестів і демо. */
export function createManualClock(start: Date | string): ManualClock {
  let current = new Date(start);
  return {
    now: () => new Date(current),
    advanceDays(days) {
      current = new Date(current.getTime() + days * 86_400_000);
    },
    set(date) {
      current = new Date(date);
    },
  };
}

/** Повних днів між двома датами (для «скільки днів заявка лежить»). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
