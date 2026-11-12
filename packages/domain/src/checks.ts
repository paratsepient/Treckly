import { evaluateBudget, inWorkImpact, requestImpact, type BudgetImpact, type BudgetIssue } from "./budget.ts";
import { DomainError, type DomainErrorCode } from "./errors.ts";
import { isApprovedStatus, type Budget, type Positions, type Request, type RequestLine } from "./types.ts";

export interface CheckIssue {
  readonly code: DomainErrorCode;
  /** Рядок заявки, якого стосується проблема; для бюджету — null. */
  readonly lineId: string | null;
  readonly message: string;
  readonly details: Readonly<Record<string, unknown>>;
}

export interface CheckReport {
  readonly ok: boolean;
  readonly errors: readonly CheckIssue[];
  /** Попередження не блокують подання: сума «у роботі» перевищує залишок. */
  readonly warnings: readonly CheckIssue[];
  readonly impact: BudgetImpact;
  readonly inWork: BudgetImpact;
}

export interface CheckInput {
  readonly lines: readonly RequestLine[];
  readonly positions: Positions;
  /**
   * План в/ч автора на 2027 рік: скільки кожної позиції переліку заплановано в підрозділі (id позиції → кількість).
   * Автор може замовити лише те, що заплановано на його частину, і не більше запланованого.
   */
  readonly unitPlan: Readonly<Record<string, number>>;
  /** В/ч автора: план рахується разом з іншими її заявками, а зайняті позиції не можна взяти вдруге. */
  readonly unitId: string;
  readonly budget: Budget;
  /** Усі заявки напрямку: з них береться сума «у роботі». */
  readonly requests: readonly Request[];
  /** Заявка, яку перевіряють (виключається із суми «у роботі»). */
  readonly requestId?: string;
}

function budgetIssue(code: "BUDGET_EXCEEDED", issue: BudgetIssue, message: string): CheckIssue {
  return { code, lineId: null, message, details: { ...issue } };
}

/**
 * Автоперевірки при створенні (правило 7): позиція є в переліку напрямку й у плані в/ч;
 * кількість не перевищує ні плану в/ч, ні доступної за переліком; КЕКВ рядка збігається
 * з КЕКВ позиції; сума не перевищує залишок.
 */
export function checkRequest(input: CheckInput): CheckReport {
  const errors: CheckIssue[] = [];
  const warnings: CheckIssue[] = [];
  const qtyByPosition = new Map<string, number>();

  // Інші заявки цієї в/ч: що вже замовлено (з планом в/ч рахується все, крім чернеток, відкликаних і незакуплених),
  // які позиції зайняті незавершеними заявками і де закупівля вже почалась.
  const others = input.requests.filter((r) => r.id !== input.requestId && r.route[0] === input.unitId);
  const ordered = new Map<string, number>();
  const busy = new Map<string, string>();
  const started = new Map<string, string>();
  for (const r of others) {
    const counts = !["draft", "withdrawn", "not_procured"].includes(r.status);
    const unfinished = r.status === "at_level" || r.status === "in_list" || r.status === "returned";
    const purchasing = isApprovedStatus(r.status) && r.status !== "issued";
    for (const line of r.lines) {
      if (counts) ordered.set(line.positionId, (ordered.get(line.positionId) ?? 0) + line.qty);
      if (unfinished && !busy.has(line.positionId)) busy.set(line.positionId, r.id);
      if (purchasing && !started.has(line.positionId)) started.set(line.positionId, r.id);
    }
  }

  for (const line of input.lines) {
    const position = input.positions[line.positionId];
    if (!position) {
      errors.push({ code: "NOT_IN_LIST", lineId: line.id, message: "Позиції немає в Попередньому переліку напрямку.", details: { positionId: line.positionId } });
      continue;
    }
    const planned = input.unitPlan[line.positionId];
    if (planned === undefined) {
      errors.push({
        code: "NOT_IN_LIST",
        lineId: line.id,
        message: "Позиції немає в плані вашої в/ч на 2027 рік.",
        details: { positionId: line.positionId, reason: "NOT_IN_UNIT_PLAN" },
      });
      continue;
    }
    const busyIn = busy.get(line.positionId);
    if (busyIn) {
      errors.push({
        code: "POSITION_BUSY",
        lineId: line.id,
        message: "Позиція вже в іншій незавершеній заявці вашої в/ч.",
        details: { positionId: line.positionId, requestId: busyIn },
      });
      continue;
    }
    const startedIn = started.get(line.positionId);
    if (startedIn) {
      // Закупівля вже почалась: попередження, але заміну подати можна (розділ 10 концепції).
      warnings.push({
        code: "POSITION_BUSY",
        lineId: line.id,
        message: "Закупівля цієї позиції за іншою заявкою вже почалась.",
        details: { positionId: line.positionId, requestId: startedIn, reason: "PURCHASE_STARTED" },
      });
    }
    if (!Number.isInteger(line.qty) || line.qty <= 0) {
      errors.push({ code: "QTY_EXCEEDED", lineId: line.id, message: "Кількість — додатне ціле число.", details: { qty: line.qty, reason: "QTY_INVALID" } });
    } else {
      const total = (qtyByPosition.get(line.positionId) ?? 0) + line.qty;
      qtyByPosition.set(line.positionId, total);
      const already = ordered.get(line.positionId) ?? 0;
      const left = Math.max(0, planned - already);
      if (total > left) {
        errors.push({
          code: "QTY_EXCEEDED",
          lineId: line.id,
          message: "Кількість перевищує те, що лишилось у плані вашої в/ч.",
          details: { positionId: line.positionId, requested: total, available: left, planned, alreadyOrdered: already, reason: "UNIT_PLAN_EXCEEDED" },
        });
      } else if (total > position.availableQty) {
        errors.push({
          code: "QTY_EXCEEDED",
          lineId: line.id,
          message: "Кількість перевищує доступну за переліком.",
          details: { positionId: line.positionId, requested: total, available: position.availableQty },
        });
      }
    }
    if (line.kekv !== position.kekv) {
      errors.push({
        code: "KEKV_MISMATCH",
        lineId: line.id,
        message: "КЕКВ рядка не збігається з КЕКВ позиції переліку.",
        details: { lineKekv: line.kekv, positionKekv: position.kekv },
      });
    }
  }

  const impact = requestImpact(input.lines, input.positions);
  const inWork = inWorkImpact(input.requests, input.positions, input.requestId);
  const evaluation = evaluateBudget(input.budget, impact, inWork);
  for (const issue of evaluation.errors) {
    errors.push(budgetIssue("BUDGET_EXCEEDED", issue, "Сума перевищує залишок затвердженого бюджету."));
  }
  for (const issue of evaluation.warnings) {
    warnings.push(budgetIssue("BUDGET_EXCEEDED", issue, "Разом із заявками «у роботі» сума перевищує залишок бюджету."));
  }
  return { ok: errors.length === 0, errors, warnings, impact, inWork };
}

/** Кидає помилку з кодом першої проблеми; усі проблеми — у `details.issues`. */
export function assertChecksPass(report: CheckReport): void {
  const first = report.errors[0];
  if (first) {
    throw new DomainError(first.code, first.message, { issues: report.errors });
  }
}
