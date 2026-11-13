import { commitmentsImpact, evaluateBudget, requestImpact, withCommitments, type BudgetImpact } from "./budget.ts";
import { bumped, guardRevision, levelAudience, makeEvent, stamp, type DomainContext } from "./context.ts";
import { DomainError } from "./errors.ts";
import { assertLevelRole } from "./permissions.ts";
import { parseSedoNumber } from "./sedo.ts";
import type { Audience, Budget, CatalogAddition, DailyList, Level, Meta, Notification, Outcome, Positions, PropertyChange, Request, RequestLine, UnitId } from "./types.ts";
import { FINAL_LEVEL, kekvCheckedAt, signerKind } from "./types.ts";

function invalid(message: string, details: Readonly<Record<string, unknown>> = {}): DomainError {
  return new DomainError("INVALID_TRANSITION", message, details);
}

function notification(ctx: DomainContext, kind: Notification["kind"], request: Request, audience: Notification["audience"], listId: string | null): Notification {
  return { kind, audience, requestId: request.id, listId, note: null, at: stamp(ctx).at };
}

export interface FormListInput {
  readonly level: Level;
  readonly unitId: UnitId;
  /** Обрані заявки; необрані лишаються в черзі рівня. */
  readonly selected: readonly Request[];
  /** Наявні переліки: один перелік на (рівень, підрозділ, день). */
  readonly existingLists: readonly DailyList[];
}

/** Правило 4: перелік формується за кнопкою з обраних заявок. */
export function formList(ctx: DomainContext, meta: Meta, input: FormListInput): Outcome {
  const { level, unitId, selected } = input;
  assertLevelRole(meta.actor, "preparer", level, unitId);
  if (selected.length === 0) {
    throw invalid("Оберіть хоча б одну заявку.", { reason: "EMPTY_SELECTION" });
  }
  if (new Set(selected.map((r) => r.id)).size !== selected.length) {
    throw invalid("Заявка вибрана двічі.", { reason: "DUPLICATE_SELECTION" });
  }
  for (const request of selected) {
    guardRevision(meta, request);
    if (request.status !== "at_level" || request.level !== level || request.route[level - 1] !== unitId) {
      throw invalid("Заявка не в черзі цього рівня й підрозділу.", { requestId: request.id, status: request.status, level: request.level });
    }
    if (!kekvCheckedAt(request, level)) {
      throw invalid("Заявку із заміною спершу перевірте: «Відповідає вимогам».", { reason: "KEKV_NOT_CHECKED", requestId: request.id });
    }
  }
  const { today } = stamp(ctx);
  const clash = input.existingLists.find((l) => l.level === level && l.unitId === unitId && l.date === today && (l.status === "formed" || l.status === "approved"));
  if (clash) {
    throw invalid("Перелік цього рівня й підрозділу на сьогодні вже існує.", { reason: "LIST_EXISTS", listId: clash.id });
  }
  const list: DailyList = {
    id: ctx.ids.next("list"),
    level,
    unitId,
    date: today,
    status: "formed",
    requestIds: selected.map((r) => r.id),
    formedBy: meta.actor.userId,
    sedoNumber: null,
    approvedBy: null,
    revision: 1,
  };
  const requests = selected.map((r) => bumped(r, { status: "in_list" as const, listId: list.id }));
  return {
    requests,
    lists: [list],
    events: [
      makeEvent(ctx, meta, { type: "list.formed", listId: list.id, data: { level, unitId, date: today, requestIds: list.requestIds } }),
      ...requests.map((r) =>
        makeEvent(ctx, meta, { type: "request.listed", requestId: r.id, listId: list.id, from: "at_level", to: "in_list", requestVersion: r.version, revision: r.revision, data: { level } }),
      ),
    ],
    // Керівнику рівня — один сигнал на перелік (за першою заявкою), а не на кожну.
    notifications: [notification(ctx, "list_formed", selected[0] as Request, levelAudience(selected[0] as Request, level, signerKind(level)), list.id)],
  };
}

export interface ListInput {
  readonly list: DailyList;
  /** Усі заявки переліку. */
  readonly requests: readonly Request[];
}

function assertListConsistent(input: ListInput): void {
  const { list, requests } = input;
  const ids = new Set(requests.map((r) => r.id));
  if (list.status !== "formed") {
    throw invalid("Перелік уже не в стані «сформовано».", { status: list.status });
  }
  if (ids.size !== list.requestIds.length || list.requestIds.some((id) => !ids.has(id))) {
    throw invalid("Склад переліку не збігається з переданими заявками.", { listId: list.id });
  }
  for (const request of requests) {
    if (request.status !== "in_list" || request.listId !== list.id) {
      throw invalid("Заявка не входить до цього переліку.", { requestId: request.id });
    }
  }
}

/** Правило 5: непогоджений перелік розформовує той, хто його сформував. */
export function disbandList(ctx: DomainContext, meta: Meta, input: ListInput): Outcome {
  const { list } = input;
  assertLevelRole(meta.actor, "preparer", list.level, list.unitId);
  if (meta.actor.userId !== list.formedBy) {
    throw new DomainError("FORBIDDEN_ROLE", "Розформувати перелік може лише той, хто його сформував.", { listId: list.id });
  }
  guardRevision(meta, list);
  assertListConsistent(input);
  const requests = input.requests.map((r) => bumped(r, { status: "at_level" as const, listId: null }));
  return {
    requests,
    lists: [bumped(list, { status: "disbanded" as const })],
    events: [
      makeEvent(ctx, meta, { type: "list.disbanded", listId: list.id, data: { reason: "disband" } }),
      ...requests.map((r) =>
        makeEvent(ctx, meta, { type: "request.delisted", requestId: r.id, listId: list.id, from: "in_list", to: "at_level", requestVersion: r.version, revision: r.revision, data: { level: list.level } }),
      ),
    ],
    notifications: [],
  };
}

export interface NotSignedInput extends ListInput {
  /** Чому Голова не підписав: обов'язкова, йде авторам і нижчим рівням. */
  readonly note: string;
}

/**
 * Рівень 5: Відділ відмічає, що Голова не підписав остаточний перелік. Часткового підпису немає:
 * усі заявки переліку повертаються авторам з приміткою (правило 3), рівні 4…1 отримують сповіщення,
 * перелік розформовується. Бюджет не резервувався — вивільняти нічого.
 */
export function markNotSigned(ctx: DomainContext, meta: Meta, input: NotSignedInput): Outcome {
  const { list } = input;
  if (list.level !== FINAL_LEVEL) {
    throw invalid("«Голова не підписав» — лише для остаточного переліку рівня 5.", { level: list.level });
  }
  assertLevelRole(meta.actor, signerKind(list.level), list.level, list.unitId);
  guardRevision(meta, list);
  assertListConsistent(input);
  for (const request of input.requests) guardRevision(meta, request);
  const reason = input.note.trim();
  if (reason === "") {
    throw new DomainError("NOTE_REQUIRED", "Напишіть, чому Голова не підписав перелік: примітка піде авторам.");
  }
  const note = `Голова не підписав перелік: ${reason}`;
  const { at, today } = stamp(ctx);
  const notifications: Notification[] = [];
  const requests = input.requests.map((request) => {
    const cascade: Audience[] = [];
    for (let l = FINAL_LEVEL - 1; l >= 1; l -= 1) cascade.push(levelAudience(request, l as Level, "both"));
    cascade.push({ kind: "author", userId: request.authorId });
    for (const audience of cascade) notifications.push({ kind: "request_returned", audience, requestId: request.id, listId: list.id, note, at });
    return bumped(request, {
      status: "returned" as const,
      level: null,
      listId: null,
      levelEnteredOn: today,
      returnInfo: { level: FINAL_LEVEL, note, byUserId: meta.actor.userId, at, cascade, reason: "not_signed" as const },
      kekvCheck: null,
    });
  });
  return {
    requests,
    lists: [bumped(list, { status: "not_signed" as const })],
    events: [
      makeEvent(ctx, meta, { type: "list.not_signed", listId: list.id, data: { note: reason, requestIds: list.requestIds } }),
      ...requests.map((r) =>
        makeEvent(ctx, meta, {
          type: "request.returned",
          requestId: r.id,
          listId: list.id,
          from: "in_list",
          to: "returned",
          requestVersion: r.version,
          revision: r.revision,
          data: { level: FINAL_LEVEL, note, reason: "NOT_SIGNED" },
        }),
      ),
    ],
    notifications,
  };
}

export interface ApproveListInput extends ListInput {
  readonly sedoNumber: string | number;
  /** Потрібні на рівні 5: перевірка ліміту й зміна плану. */
  readonly positions: Positions;
  readonly budget: Budget;
  /** Усі заявки напрямку: погоджені, ще не закуплені зміни рахуються в ліміт. */
  readonly allRequests?: readonly Request[];
}

/**
 * Правило 1 і 6: погодження з числовим номером СЕДО. Усі заявки переліку разом
 * переходять на рівень вище; на рівні 5 — затверджуються й резервують бюджет.
 */
export function approveList(ctx: DomainContext, meta: Meta, input: ApproveListInput): Outcome {
  const { list } = input;
  assertLevelRole(meta.actor, signerKind(list.level), list.level, list.unitId);
  guardRevision(meta, list);
  assertListConsistent(input);
  for (const request of input.requests) guardRevision(meta, request);
  const sedoNumber = parseSedoNumber(input.sedoNumber);
  const { today } = stamp(ctx);
  const approvedList: DailyList = bumped(list, { status: "approved" as const, sedoNumber, approvedBy: meta.actor.userId });
  const listEvent = makeEvent(ctx, meta, { type: "list.approved", listId: list.id, data: { level: list.level, sedoNumber } });

  if (list.level < FINAL_LEVEL) {
    const nextLevel = (list.level + 1) as Level;
    const requests = input.requests.map((r) => bumped(r, { level: nextLevel, status: "at_level" as const, listId: null, levelEnteredOn: today }));
    return {
      requests,
      lists: [approvedList],
      events: [
        listEvent,
        ...requests.map((r) =>
          makeEvent(ctx, meta, { type: "request.advanced", requestId: r.id, listId: list.id, from: "in_list", to: "at_level", requestVersion: r.version, revision: r.revision, data: { fromLevel: list.level, level: nextLevel, sedoNumber } }),
        ),
      ],
      notifications: requests.map((r) => notification(ctx, "request_advanced", r, levelAudience(r, nextLevel, "preparer"), list.id)),
    };
  }

  // Рівень 5: Голова затверджує; резерв бюджету (правило 8) лише тут.
  const total = input.requests.reduce<BudgetImpact>(
    (acc, r) => {
      const impact = requestImpact(r.lines, input.positions);
      const perKekv = { ...acc.perKekv };
      for (const [kekv, amount] of Object.entries(impact.perKekv)) perKekv[kekv] = (perKekv[kekv] ?? 0) + amount;
      return { perKekv, total: acc.total + impact.total };
    },
    { perKekv: {}, total: 0 },
  );
  // Бюджет не списується при погодженні (лише після закупівлі), але погодити понад ліміт не можна:
  // рахуємо списане разом з уже погодженими, ще не закупленими змінами.
  const inList = new Set(input.requests.map((r) => r.id));
  const evaluation = evaluateBudget(withCommitments(input.budget, commitmentsImpact(input.allRequests ?? [], input.positions, inList)), total);
  const exceeded = evaluation.errors[0];
  if (exceeded) {
    throw new DomainError("BUDGET_EXCEEDED", "Сума переліку перевищує залишок затвердженого бюджету.", { ...exceeded });
  }
  // Перелік змінюється підписом Голови: стара позиція плану в/ч зменшується на замінене, новий предмет
  // додається в план зі статусом «Погоджені зміни» (рішення користувача 2026-11-13).
  const catalog: CatalogAddition[] = [];
  const property: PropertyChange[] = [];
  const requests = input.requests.map((r) => {
    const lines = r.lines.map((line, index): RequestLine => {
      if (line.kind !== "replacement") return line;
      const tag = `${r.id.replace(/^req-/, "").toUpperCase()}-${index + 1}`;
      // «ПЗ» — погоджена зміна: не плутати з номером заявки «ЗМ-…».
      const code = `ПЗ-${tag}`;
      const positionId = `pos-${r.id}-${line.id}`;
      const old = input.positions[line.positionId];
      catalog.push({
        itemId: `item-${r.id}-${line.id}`,
        positionId,
        code,
        name: line.newItem.name,
        kekv: line.newItem.kekv,
        priceMinor: Math.round(line.newItem.totalMinor / line.newItem.qty),
        measure: line.newItem.measure,
      });
      if (old) property.push({ unitId: r.route[0], code: old.code, tab: "planned", delta: -line.qty });
      property.push({ unitId: r.route[0], code, tab: "planned", delta: line.newItem.qty });
      return { ...line, newItem: { ...line.newItem, code }, newPositionId: positionId };
    });
    return bumped(r, { status: "approved" as const, level: FINAL_LEVEL, levelEnteredOn: today, lines });
  });
  return {
    requests,
    lists: [approvedList],
    events: [
      listEvent,
      ...requests.map((r) =>
        makeEvent(ctx, meta, { type: "request.approved", requestId: r.id, listId: list.id, from: "in_list", to: "approved", requestVersion: r.version, revision: r.revision, data: { sedoNumber } }),
      ),
    ],
    notifications: requests.flatMap((r) => [
      notification(ctx, "request_approved", r, { kind: "author", userId: r.authorId }, list.id),
      ...([1, 2, 3, 4] as const).map((l) => notification(ctx, "request_approved", r, levelAudience(r, l, "both"), list.id)),
    ]),
    catalog,
    property,
  };
}
