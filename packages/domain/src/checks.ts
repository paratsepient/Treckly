import { evaluateBudget, inWorkImpact, requestImpact, type BudgetImpact, type BudgetIssue } from "./budget.ts";
import { DomainError, type DomainErrorCode } from "./errors.ts";
import type { Budget, Positions, Request, RequestLine } from "./types.ts";

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
 * Автоперевірки при створенні (правило 7): позиція є в переліку; кількість не
 * перевищує доступну; КЕКВ рядка збігається з КЕКВ позиції; сума не перевищує залишок.
 */
export function checkRequest(input: CheckInput): CheckReport {
  const errors: CheckIssue[] = [];
  const warnings: CheckIssue[] = [];
  const qtyByPosition = new Map<string, number>();

  for (const line of input.lines) {
    const position = input.positions[line.positionId];
    if (!position) {
      errors.push({ code: "NOT_IN_LIST", lineId: line.id, message: "Позиції немає в Попередньому переліку напрямку.", details: { positionId: line.positionId } });
      continue;
    }
    if (!Number.isInteger(line.qty) || line.qty <= 0) {
      errors.push({ code: "QTY_EXCEEDED", lineId: line.id, message: "Кількість — додатне ціле число.", details: { qty: line.qty, reason: "QTY_INVALID" } });
    } else {
      const total = (qtyByPosition.get(line.positionId) ?? 0) + line.qty;
      qtyByPosition.set(line.positionId, total);
      if (total > position.availableQty) {
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
