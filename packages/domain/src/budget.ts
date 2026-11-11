import type { Budget, BudgetLine, Kekv, Money, Position, Positions, Request, RequestLine } from "./types.ts";

/** Вплив на бюджет: зміна по кожному КЕКВ і загальна зміна. Від'ємне — вивільнення. */
export interface BudgetImpact {
  readonly perKekv: Readonly<Record<Kekv, Money>>;
  readonly total: Money;
}

export const EMPTY_IMPACT: BudgetImpact = { perKekv: {}, total: 0 };

/**
 * Правило 9: заміна в межах одного КЕКВ ліміт не витрачає; на інший КЕКВ —
 * сума нового списується з нового КЕКВ, а сума старого вивільняється в старому
 * (припущення з документа розробки, потребує підтвердження).
 */
export function lineEffect(line: RequestLine, position: Position): Record<Kekv, Money> {
  if (line.kind === "by_list") {
    return { [line.kekv]: line.qty * position.priceMinor };
  }
  if (position.kekv === line.newItem.kekv) return {};
  return {
    [line.newItem.kekv]: line.qty * line.newItem.priceMinor,
    [position.kekv]: -(line.qty * position.priceMinor),
  };
}

function addInto(target: Record<Kekv, Money>, delta: Readonly<Record<Kekv, Money>>): void {
  for (const [kekv, amount] of Object.entries(delta)) {
    target[kekv] = (target[kekv] ?? 0) + amount;
  }
}

function toImpact(perKekv: Record<Kekv, Money>): BudgetImpact {
  const total = Object.values(perKekv).reduce((sum, amount) => sum + amount, 0);
  return { perKekv, total };
}

/** Позиції, яких немає в переліку, пропускаються: їх відсікають автоперевірки. */
export function requestImpact(lines: readonly RequestLine[], positions: Positions): BudgetImpact {
  const perKekv: Record<Kekv, Money> = {};
  for (const line of lines) {
    const position = positions[line.positionId];
    if (position) addInto(perKekv, lineEffect(line, position));
  }
  return toImpact(perKekv);
}

/** Заявки, що ще йдуть маршрутом (сума «у роботі»). */
export function inWorkImpact(requests: readonly Request[], positions: Positions, excludeId?: string): BudgetImpact {
  const perKekv: Record<Kekv, Money> = {};
  for (const request of requests) {
    if (request.id === excludeId) continue;
    if (request.status !== "at_level" && request.status !== "in_list") continue;
    addInto(perKekv, requestImpact(request.lines, positions).perKekv);
  }
  return toImpact(perKekv);
}

const NO_LINE: BudgetLine = { limitMinor: 0, approvedMinor: 0 };

export function remainingOf(line: BudgetLine): Money {
  return line.limitMinor - line.approvedMinor;
}

export interface BudgetIssue {
  /** КЕКВ або "TOTAL" для загального бюджету. */
  readonly scope: Kekv | "TOTAL";
  readonly requestedMinor: Money;
  readonly remainingMinor: Money;
  readonly inWorkMinor: Money;
}

export interface BudgetEvaluation {
  /** Перевищення затвердженого залишку — блокування. */
  readonly errors: readonly BudgetIssue[];
  /** Перевищення залишку з урахуванням суми «у роботі» — попередження. */
  readonly warnings: readonly BudgetIssue[];
}

export function evaluateBudget(budget: Budget, impact: BudgetImpact, inWork: BudgetImpact = EMPTY_IMPACT): BudgetEvaluation {
  const errors: BudgetIssue[] = [];
  const warnings: BudgetIssue[] = [];
  const scopes: { scope: Kekv | "TOTAL"; line: BudgetLine; requested: Money; inWork: Money }[] = [
    { scope: "TOTAL", line: budget.total, requested: impact.total, inWork: inWork.total },
    ...Object.entries(impact.perKekv).map(([kekv, requested]) => ({
      scope: kekv,
      line: budget.perKekv[kekv] ?? NO_LINE,
      requested,
      inWork: inWork.perKekv[kekv] ?? 0,
    })),
  ];
  for (const { scope, line, requested, inWork: work } of scopes) {
    if (requested <= 0) continue;
    const issue: BudgetIssue = { scope, requestedMinor: requested, remainingMinor: remainingOf(line), inWorkMinor: work };
    if (requested > remainingOf(line)) errors.push(issue);
    else if (requested + work > remainingOf(line)) warnings.push(issue);
  }
  return { errors, warnings };
}

/** Резервування при затвердженні Головою. */
export function reserve(budget: Budget, impact: BudgetImpact): Budget {
  const perKekv: Record<Kekv, BudgetLine> = { ...budget.perKekv };
  for (const [kekv, amount] of Object.entries(impact.perKekv)) {
    const current = perKekv[kekv] ?? NO_LINE;
    perKekv[kekv] = { ...current, approvedMinor: current.approvedMinor + amount };
  }
  return { total: { ...budget.total, approvedMinor: budget.total.approvedMinor + impact.total }, perKekv };
}
