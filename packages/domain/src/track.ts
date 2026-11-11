import { daysBetween } from "./clock.ts";
import type { IsoDate, JournalEvent, Level, Request } from "./types.ts";

export type TrackStepState = "done" | "current" | "pending" | "returned";

export interface TrackStep {
  readonly level: Level;
  readonly state: TrackStepState;
  /** День, коли заявка потрапила на рівень (поточна версія документа). */
  readonly enteredOn: IsoDate | null;
  /** Днів на рівні: до виходу з нього або до сьогодні, якщо заявка там зараз. */
  readonly daysAtLevel: number | null;
  /** Номер СЕДО переліку, яким рівень погодив заявку. */
  readonly sedoNumber: number | null;
  /** Заявка в сформованому переліку цього рівня (чекає погодження керівника). */
  readonly inList: boolean;
}

export type Track = readonly [TrackStep, TrackStep, TrackStep, TrackStep, TrackStep];

const LEVELS: readonly Level[] = [1, 2, 3, 4, 5];

/**
 * Трек 5 рівнів: де зараз заявка і скільки днів вона там. Будується з журналу поточної
 * версії документа. Повернення показується каскадом: усі рівні від 1 до того, що повернув,
 * позначені «повернуто» (правило 3).
 */
export function buildTrack(request: Request, events: readonly JournalEvent[], today: IsoDate): Track {
  const entered = new Map<Level, IsoDate>();
  const left = new Map<Level, IsoDate>();
  const sedo = new Map<Level, number>();
  let withdrawnAt: Level | 0 = 0;

  for (const event of events) {
    if (event.requestId !== request.id || event.requestVersion !== request.version) continue;
    const date = event.at.slice(0, 10);
    const data = event.data;
    switch (event.type) {
      case "request.submitted":
      case "request.resubmitted":
        entered.set(1, date);
        break;
      case "request.advanced": {
        const from = data["fromLevel"] as Level;
        const to = data["level"] as Level;
        left.set(from, date);
        sedo.set(from, data["sedoNumber"] as number);
        entered.set(to, date);
        break;
      }
      case "request.approved":
        left.set(5, date);
        sedo.set(5, data["sedoNumber"] as number);
        break;
      case "request.returned":
        left.set(data["level"] as Level, date);
        break;
      case "request.withdrawn":
        withdrawnAt = data["reachedLevel"] as Level | 0;
        break;
      default:
        break;
    }
  }

  const stateOf = (level: Level): TrackStepState => {
    switch (request.status) {
      case "draft":
        return "pending";
      case "at_level":
      case "in_list":
        return level < (request.level as Level) ? "done" : level === request.level ? "current" : "pending";
      case "approved":
      case "extract_issued":
        return "done";
      case "returned":
        return level <= (request.returnInfo?.level ?? 0) ? "returned" : "pending";
      case "withdrawn":
        return level <= withdrawnAt ? "done" : "pending";
    }
  };

  const step = (level: Level): TrackStep => {
    const state = stateOf(level);
    const from = entered.get(level) ?? null;
    const to = left.get(level) ?? (state === "current" ? today : null);
    return {
      level,
      state,
      enteredOn: from,
      daysAtLevel: from !== null && to !== null ? daysBetween(from, to) : null,
      sedoNumber: sedo.get(level) ?? null,
      inList: request.status === "in_list" && request.level === level,
    };
  };

  return LEVELS.map(step) as unknown as Track;
}
