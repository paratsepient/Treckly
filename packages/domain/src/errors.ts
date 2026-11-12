/**
 * Коди помилок: вісім із документа розробки (розділ 6) плюс NOTE_REQUIRED
 * (примітка до повернення обов'язкова; у документі окремого коду немає).
 */
export type DomainErrorCode =
  | "NOT_IN_LIST"
  | "QTY_EXCEEDED"
  | "KEKV_MISMATCH"
  | "BUDGET_EXCEEDED"
  | "INVALID_TRANSITION"
  | "FORBIDDEN_ROLE"
  | "VERSION_CONFLICT"
  | "SEDO_NUMBER_INVALID"
  | "NOTE_REQUIRED"
  /** Позиція вже в іншій незавершеній заявці в/ч: її не можна обрати вдруге. */
  | "POSITION_BUSY";

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(code: DomainErrorCode, message: string, details: Readonly<Record<string, unknown>> = {}) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.details = details;
  }
}
