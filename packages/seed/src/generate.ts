import { fakerUK as faker } from "@faker-js/faker";
import {
  approveList,
  createDraft,
  createManualClock,
  createSequentialIds,
  formList,
  inWorkImpact,
  issueExtracts,
  returnRequest,
  submit,
  withdraw,
  type Actor,
  type Budget,
  type DailyList,
  type DomainContext,
  type Level,
  type Outcome,
  type Positions,
  type Request,
  type RequestLine,
} from "@dsp/domain";
import { KEKV_INFO, LIST_ITEMS, REPLACEMENT_CANDIDATES, type CatalogEntry } from "./catalog.ts";
import { DIRECTION_ID, generateUsers, routeOf, UNITS, UNIT_IDS, type SeedUnit, type SeedUser, type UnitKey } from "./structure.ts";

export interface SeedItem {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly kekv: string;
  readonly priceMinor: number;
  readonly measure: string;
  readonly groupKey: string;
}

export interface SeedListPosition {
  readonly id: string;
  readonly directionId: string;
  readonly itemId: string;
  readonly plannedQty: number;
}

export interface SeedProperty {
  readonly id: string;
  readonly unitId: string;
  readonly itemId: string;
  readonly tab: "planned" | "on_base" | "received";
  readonly qty: number;
}

export interface SeedData {
  readonly directionId: string;
  readonly units: readonly SeedUnit[];
  readonly users: readonly SeedUser[];
  readonly kekv: readonly { readonly code: string; readonly name: string }[];
  readonly items: readonly SeedItem[];
  readonly listPositions: readonly SeedListPosition[];
  /** Фінальний бюджет: ліміти підібрано під стан заявок, затверджене — результат проганяння. */
  readonly budget: Budget;
  readonly property: readonly SeedProperty[];
  /** Усі зміни стану в порядку виконання: їх відтворює `applySeed`, тож трек і журнал узгоджені. */
  readonly outcomes: readonly Outcome[];
  /** Симульований «сьогодні» після сценарію. */
  readonly now: string;
}

const SEED = 2027;
const START = "2027-02-01T09:00:00Z";
const PREFIX = { "2210": "ПМ", "2220": "МД", "3110": "ОБ" } as const;
const kopecks = (uah: number): number => uah * 100;

/** Позиції, які заплановано в кожній в/ч для показу: акумулятори, зарядка, антени, квадрокоптер. */
const CORE_POSITIONS = [1, 2, 3, 4, 6, 30] as const;

/** Типові обґрунтування рапортів (синтетичні). */
const JUSTIFICATIONS = [
  "Майно, що є в підрозділі, зношене під час виконання завдань і не підлягає ремонту. Для підтримання боєздатності потрібне поповнення в межах Попереднього переліку на 2027 рік.",
  "У зв'язку з доукомплектуванням підрозділу особовим складом наявної кількості майна недостатньо. Потребу визначено за штатом і нормами забезпечення.",
  "Запланована позиція переліку не відповідає умовам експлуатації в підрозділі, тому замість неї просимо схожий предмет. Решта позицій — планове поповнення.",
  "Майно втрачено під час виконання бойових завдань, акти списання оформлено. Для відновлення забезпечення просимо закупівлю за переліком.",
] as const;

const itemId = (n: number): string => `item-${String(n).padStart(3, "0")}`;
const positionId = (n: number): string => `pos-${String(n).padStart(3, "0")}`;

function buildCatalog(): { items: SeedItem[]; positions: SeedListPosition[] } {
  const toItem = (entry: CatalogEntry, id: string, number: number): SeedItem => ({
    id,
    code: `${PREFIX[entry.kekv]}-${String(number).padStart(3, "0")}`,
    name: entry.name,
    kekv: entry.kekv,
    priceMinor: kopecks(entry.priceUah),
    measure: entry.measure,
    groupKey: entry.group,
  });
  const items = [
    ...LIST_ITEMS.map((e, i) => toItem(e, itemId(i + 1), i + 1)),
    ...REPLACEMENT_CANDIDATES.map((e, i) => toItem(e, itemId(100 + i + 1), 900 + i + 1)),
  ];
  const positions = LIST_ITEMS.map((e, i) => ({ id: positionId(i + 1), directionId: DIRECTION_ID, itemId: itemId(i + 1), plannedQty: e.plannedQty }));
  return { items, positions };
}

/** Імітація виконання: застосовує команди домену й накопичує результати в порядку виконання. */
class Simulation {
  readonly clock = createManualClock(START);
  readonly ctx: DomainContext = { clock: this.clock, ids: createSequentialIds() };
  readonly requests = new Map<string, Request>();
  readonly lists = new Map<string, DailyList>();
  readonly outcomes: Outcome[] = [];
  budget: Budget;
  private keys = 0;
  private sedo = 7_240_000;

  private readonly planned: ReadonlyMap<string, number>;
  private readonly catalog: { items: SeedItem[]; positions: SeedListPosition[] };

  constructor(planned: ReadonlyMap<string, number>, catalog: { items: SeedItem[]; positions: SeedListPosition[] }) {
    this.planned = planned;
    this.catalog = catalog;
    // Під час сценарію ліміти не обмежують; підсумкові ліміти підбираються після нього.
    const huge = { limitMinor: 10 ** 13, approvedMinor: 0 };
    this.budget = { total: huge, perKekv: Object.fromEntries(KEKV_INFO.map((k) => [k.code, huge])) };
  }

  day(n: number): void {
    this.clock.set(`2027-02-${String(1 + n).padStart(2, "0")}T09:00:00Z`);
  }

  meta(actor: Actor) {
    this.keys += 1;
    return { actor, idempotencyKey: `seed-${String(this.keys).padStart(4, "0")}` };
  }

  /** Доступна кількість: план мінус кількість у затверджених заявках. */
  positions(): Positions {
    const reserved = new Map<string, number>();
    for (const r of this.requests.values()) {
      if (r.status !== "approved" && r.status !== "extract_issued") continue;
      for (const l of r.lines) reserved.set(l.positionId, (reserved.get(l.positionId) ?? 0) + l.qty);
    }
    const byItem = new Map(this.catalog.items.map((i) => [i.id, i]));
    return Object.fromEntries(
      this.catalog.positions.map((p) => {
        const item = byItem.get(p.itemId) as SeedItem;
        return [p.id, { id: p.id, code: item.code, name: item.name, kekv: item.kekv, priceMinor: item.priceMinor, availableQty: (this.planned.get(p.id) ?? 0) - (reserved.get(p.id) ?? 0) }];
      }),
    );
  }

  private record(outcome: Outcome): Outcome {
    for (const r of outcome.requests) this.requests.set(r.id, r);
    for (const l of outcome.lists) this.lists.set(l.id, l);
    if (outcome.budget) this.budget = outcome.budget;
    this.outcomes.push(outcome);
    return outcome;
  }

  get(id: string): Request {
    const r = this.requests.get(id);
    if (!r) throw new Error(`Немає заявки ${id}`);
    return r;
  }

  authorOf(unit: UnitKey): Actor {
    return { userId: `author-${unit}`, role: { kind: "author", unitId: unit } };
  }
  preparer(level: Level, unitId: string): Actor {
    return { userId: `prep-${level}-${unitId}`, role: { kind: "preparer", level, unitId } };
  }
  approver(level: Level, unitId: string): Actor {
    return { userId: `appr-${level}-${unitId}`, role: { kind: "approver", level, unitId } };
  }

  draft(unit: UnitKey, lines: RequestLine[]): string {
    // Обґрунтування — з короткого набору типових формулювань, по черзі: дані відтворювані.
    const justification = JUSTIFICATIONS[this.requests.size % JUSTIFICATIONS.length] as string;
    const out = this.record(createDraft(this.ctx, this.meta(this.authorOf(unit)), { route: routeOf(unit), lines, justification }));
    return (out.requests[0] as Request).id;
  }

  /** План в/ч: підрозділ → позиція → заплановано. Росте разом зі сценарієм: те, що просять, має бути заплановано. */
  readonly plan = new Map<string, Map<string, number>>();

  /** Доводить план в/ч до потреб заявки (із запасом) і повертає його для автоперевірок. */
  private planFor(unit: string, request: Request): Record<string, number> {
    const own = this.plan.get(unit) ?? new Map<string, number>();
    this.plan.set(unit, own);
    const need = new Map<string, number>();
    for (const line of request.lines) need.set(line.positionId, (need.get(line.positionId) ?? 0) + line.qty);
    for (const [positionKey, qty] of need) own.set(positionKey, Math.max(own.get(positionKey) ?? 0, qty + Math.ceil(qty / 5) + 1));
    return Object.fromEntries(own);
  }

  submit(id: string): void {
    const request = this.get(id);
    this.record(
      submit(this.ctx, this.meta(this.authorOf(request.route[0] as UnitKey)), {
        request,
        positions: this.positions(),
        unitPlan: this.planFor(request.route[0], request),
        budget: this.budget,
        requests: [...this.requests.values()],
      }),
    );
  }

  newSubmitted(unit: UnitKey, lines: RequestLine[]): string {
    const id = this.draft(unit, lines);
    this.submit(id);
    return id;
  }

  form(level: Level, unitId: string, ids: string[]): string {
    const out = this.record(
      formList(this.ctx, this.meta(this.preparer(level, unitId)), {
        level,
        unitId,
        selected: ids.map((id) => this.get(id)),
        existingLists: [...this.lists.values()],
      }),
    );
    return (out.lists[0] as DailyList).id;
  }

  approve(listId: string): void {
    const list = this.lists.get(listId) as DailyList;
    this.sedo += 1 + (this.sedo % 7);
    const out = this.record(
      approveList(this.ctx, this.meta(this.approver(list.level, list.unitId)), {
        list,
        requests: list.requestIds.map((id) => this.get(id)),
        sedoNumber: this.sedo,
        positions: this.positions(),
        budget: this.budget,
      }),
    );
    if (list.level === 5) {
      this.record(issueExtracts(this.ctx, this.meta({ userId: "system", role: { kind: "system" } }), { requests: out.requests }));
    }
  }

  pass(level: Level, unitId: string, ids: string[]): void {
    this.approve(this.form(level, unitId, ids));
  }

  giveBack(level: Level, unitId: string, id: string, note: string): void {
    this.record(returnRequest(this.ctx, this.meta(this.preparer(level, unitId)), { request: this.get(id), note }));
  }

  withdraw(id: string): void {
    const request = this.get(id);
    this.record(withdraw(this.ctx, this.meta(this.authorOf(request.route[0] as UnitKey)), { request }));
  }
}

/**
 * Генерує повний демо-набір. Детермінований: те саме зерно — той самий результат
 * (кнопка «Скинути демо» відновлює той самий початковий стан).
 */
export function generateSeed(): SeedData {
  faker.seed(SEED);
  const catalog = buildCatalog();
  const users = generateUsers();
  const planned = new Map(catalog.positions.map((p) => [p.id, p.plannedQty]));
  const sim = new Simulation(planned, catalog);

  // ── Рядки заявок ────────────────────────────────────────────────────────────
  const itemByName = new Map(catalog.items.map((i) => [i.name, i]));
  let lineNo = 0;
  const by = (listIndex: number, qty: number): RequestLine => {
    const entry = LIST_ITEMS[listIndex - 1] as CatalogEntry;
    lineNo += 1;
    return { kind: "by_list", id: `ln-${lineNo}`, positionId: positionId(listIndex), qty, kekv: entry.kekv };
  };
  const rep = (listIndex: number, qty: number, candidate: string): RequestLine => {
    const entry = LIST_ITEMS[listIndex - 1] as CatalogEntry;
    const item = itemByName.get(candidate);
    if (!item) throw new Error(`Немає кандидата для заміни: ${candidate}`);
    lineNo += 1;
    return {
      kind: "replacement",
      id: `ln-${lineNo}`,
      positionId: positionId(listIndex),
      qty,
      kekv: entry.kekv,
      newItem: { code: item.code, name: item.name, kekv: item.kekv, priceMinor: item.priceMinor },
    };
  };

  // ── Сценарій: стани отримують проганянням подій домену ───────────────────────
  sim.day(0);
  const r1 = sim.newSubmitted("unit-a", [by(1, 10), by(9, 20), by(33, 2), rep(20, 3, "Бінокль польовий 8×32")]);
  const r2 = sim.newSubmitted("unit-b", [by(22, 40), by(23, 50), rep(6, 1, "Антенна система мобільна")]);
  const r5 = sim.newSubmitted("unit-b", [by(30, 1), by(32, 1)]);
  const r9 = sim.newSubmitted("unit-b", [by(2, 20), by(11, 5), by(32, 1)]); // станція керування — як у примітці повернення
  const r10 = sim.newSubmitted("unit-c", [by(15, 10), by(16, 6)]);
  sim.pass(1, "unit-a", [r1]);
  sim.pass(1, "unit-b", [r2, r5, r9]);
  sim.pass(1, "unit-c", [r10]);

  sim.day(1);
  sim.pass(2, "brig-1", [r1, r2, r5, r9]);
  sim.withdraw(r10); // автор відкликає заявку на рівні 2

  sim.day(2);
  const r6 = sim.newSubmitted("unit-c", [by(36, 2), by(38, 2)]);
  const r4 = sim.newSubmitted("unit-c", [by(3, 8), by(4, 12), rep(16, 4, "Ліхтар вуличний акумуляторний")]);
  const r3 = sim.newSubmitted("unit-a", [by(26, 30), by(27, 6)]);
  sim.pass(1, "unit-c", [r6, r4]);
  sim.pass(1, "unit-a", [r3]);

  sim.day(3);
  sim.pass(3, "ru-1", [r1, r2]);
  sim.giveBack(3, "ru-1", r9, "Уточніть кількість акумуляторів і КЕКВ для станції керування.");

  sim.day(4);
  sim.pass(4, DIRECTION_ID, [r1, r2]);

  sim.day(5);
  sim.pass(5, "vor", [r1, r2]); // затвердження Головою, резерв бюджету, витяги по в/ч
  sim.pass(2, "brig-2", [r6, r4]);

  sim.day(6);
  sim.pass(3, "ru-1", [r6, r4]);

  sim.day(7);
  sim.pass(4, DIRECTION_ID, [r4]);

  sim.day(8);
  const r7 = sim.newSubmitted("unit-a", [by(12, 15), by(13, 40)]);
  const r8 = sim.newSubmitted("unit-a", [by(39, 1)]);
  sim.form(1, "unit-a", [r7]); // перелік сформовано, керівник ще не погодив; r8 лишається в черзі

  sim.day(9);
  sim.draft("unit-a", [by(17, 2), by(19, 4)]);

  sim.day(14);
  void [r3, r5, r6, r8];

  // ── Підсумкові ліміти: під стан заявок, щоб було що показати ────────────────
  const positions = sim.positions();
  const inWork = inWorkImpact([...sim.requests.values()], positions);
  const approved = sim.budget;
  const remaining: Record<string, number> = {
    // Ліміт 3110 впирається: нова велика закупівля блокується, а сума «у роботі» вже перевищує залишок.
    "3110": kopecks(100_000),
    "2210": Math.max(0, inWork.perKekv["2210"] ?? 0) * 3,
    "2220": kopecks(500_000),
  };
  const perKekv = Object.fromEntries(
    KEKV_INFO.map((k) => {
      const done = approved.perKekv[k.code]?.approvedMinor ?? 0;
      return [k.code, { limitMinor: done + (remaining[k.code] as number), approvedMinor: done }];
    }),
  );
  const budget: Budget = {
    total: { limitMinor: Object.values(perKekv).reduce((sum, l) => sum + l.limitMinor, 0), approvedMinor: approved.total.approvedMinor },
    perKekv,
  };

  // ── «Моє майно» ─────────────────────────────────────────────────────────────
  // План в/ч (вкладка «Заплановано») — це те, що підрозділ може замовляти: заявка подається лише за планом.
  // У план потрапляє все, що просили заявки в/ч (із запасом), типовий набір для демо й кілька випадкових позицій.
  const itemOfPosition = new Map(catalog.positions.map((p) => [p.id, p.itemId]));
  const plannedOfPosition = new Map(catalog.positions.map((p) => [p.id, p.plannedQty]));
  const property: SeedProperty[] = [];
  for (const unit of UNIT_IDS) {
    for (const tab of ["planned", "on_base", "received"] as const) {
      const rows: { itemId: string; qty: number }[] = [];
      if (tab === "planned") {
        const plan = new Map(sim.plan.get(unit) ?? []);
        for (const index of CORE_POSITIONS) {
          const key = positionId(index);
          plan.set(key, Math.max(plan.get(key) ?? 0, plannedOfPosition.get(key) ?? 0));
        }
        for (const [positionKey, qty] of [...plan].sort(([a], [b]) => a.localeCompare(b))) rows.push({ itemId: itemOfPosition.get(positionKey) as string, qty });
      }
      const fillers = faker.helpers.arrayElements(
        catalog.positions.filter((p) => !rows.some((row) => row.itemId === p.itemId)),
        Math.max(0, 5 - rows.length),
      );
      for (const p of fillers) rows.push({ itemId: p.itemId, qty: faker.number.int({ min: 2, max: 40 }) });
      rows.forEach((row, n) => property.push({ id: `prop-${unit}-${tab}-${n + 1}`, unitId: unit, itemId: row.itemId, tab, qty: row.qty }));
    }
  }

  return {
    directionId: DIRECTION_ID,
    units: UNITS,
    users,
    kekv: KEKV_INFO,
    items: catalog.items,
    listPositions: catalog.positions,
    budget,
    property,
    outcomes: sim.outcomes,
    now: sim.clock.now().toISOString(),
  };
}
