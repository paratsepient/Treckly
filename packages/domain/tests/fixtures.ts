import {
  createManualClock,
  createSequentialIds,
  type Actor,
  type Budget,
  type DailyList,
  type DomainContext,
  type Level,
  type ManualClock,
  type Meta,
  type Outcome,
  type Positions,
  type Request,
  type RequestLine,
  type Route,
} from "../src/index.ts";

export const ROUTE: Route = ["unit-vch", "unit-brig", "unit-ru", "unit-adm", "unit-vodr"];

export const POSITIONS: Positions = {
  p1: { id: "p1", code: "A-001", name: "Дрон-розвідник", kekv: "2210", priceMinor: 100_00, availableQty: 10 },
  p2: { id: "p2", code: "A-002", name: "Акумулятор", kekv: "2210", priceMinor: 50_00, availableQty: 5 },
  p3: { id: "p3", code: "B-001", name: "Станція зв'язку", kekv: "3110", priceMinor: 200_00, availableQty: 3 },
};

/** План в/ч у тестах: усе, що є в переліку, заплановано з великим запасом, тож обмежує перелік напрямку (окремі тести звужують план). */
export const UNIT_PLAN: Readonly<Record<string, number>> = Object.fromEntries(Object.values(POSITIONS).map((p) => [p.id, p.availableQty * 10]));

export const BUDGET: Budget = {
  total: { limitMinor: 1_000_00, approvedMinor: 0 },
  perKekv: {
    "2210": { limitMinor: 600_00, approvedMinor: 0 },
    "3110": { limitMinor: 500_00, approvedMinor: 0 },
  },
};

export const author: Actor = { userId: "u-author", role: { kind: "author", unitId: "unit-vch" } };
export const otherAuthor: Actor = { userId: "u-other", role: { kind: "author", unitId: "unit-vch" } };
export const system: Actor = { userId: "system", role: { kind: "system" } };

export function preparer(level: Level, userId = `u-prep-${level}`): Actor {
  return { userId, role: { kind: "preparer", level, unitId: ROUTE[level - 1] as string } };
}
export function approver(level: Level, userId = `u-appr-${level}`): Actor {
  return { userId, role: { kind: "approver", level, unitId: ROUTE[level - 1] as string } };
}

let keyCounter = 0;
export function meta(actor: Actor, expectedRevisions?: Record<string, number>): Meta {
  keyCounter += 1;
  return { actor, idempotencyKey: `key-${keyCounter}`, ...(expectedRevisions ? { expectedRevisions } : {}) };
}

export function byList(id: string, positionId: string, qty: number, kekv?: string): RequestLine {
  const position = POSITIONS[positionId];
  return { kind: "by_list", id, positionId, qty, kekv: kekv ?? position?.kekv ?? "?" };
}

export function replacement(id: string, positionId: string, qty: number, newKekv: string, newPriceMinor: number): RequestLine {
  const position = POSITIONS[positionId];
  return {
    kind: "replacement",
    id,
    positionId,
    qty,
    kekv: position?.kekv ?? "?",
    newItem: { code: "N-1", name: "Новий предмет", kekv: newKekv, priceMinor: newPriceMinor },
  };
}

export interface World {
  readonly ctx: DomainContext;
  readonly clock: ManualClock;
  readonly requests: Map<string, Request>;
  readonly lists: Map<string, DailyList>;
  budget: Budget;
  readonly events: Outcome["events"][number][];
  readonly notifications: Outcome["notifications"][number][];
}

/** Мінімальне «сховище» для тестів: застосовує результат команди, як це зробить API. */
export function createWorld(start = "2027-01-10T09:00:00Z"): World {
  const clock = createManualClock(start);
  const world: World = {
    ctx: { clock, ids: createSequentialIds() },
    clock,
    requests: new Map(),
    lists: new Map(),
    budget: BUDGET,
    events: [],
    notifications: [],
  };
  return world;
}

export function apply(world: World, outcome: Outcome): Outcome {
  for (const r of outcome.requests) world.requests.set(r.id, r);
  for (const l of outcome.lists) world.lists.set(l.id, l);
  if (outcome.budget) world.budget = outcome.budget;
  world.events.push(...outcome.events);
  world.notifications.push(...outcome.notifications);
  return outcome;
}

export function get(world: World, id: string): Request {
  const request = world.requests.get(id);
  if (!request) throw new Error(`Немає заявки ${id}`);
  return request;
}

export function getList(world: World, id: string): DailyList {
  const list = world.lists.get(id);
  if (!list) throw new Error(`Немає переліку ${id}`);
  return list;
}

export function all(world: World): Request[] {
  return [...world.requests.values()];
}
