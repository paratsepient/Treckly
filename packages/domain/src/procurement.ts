import { requestImpact } from "./budget.ts";
import { bumped, guardRevision, makeEvent, stamp, type DomainContext } from "./context.ts";
import { DomainError } from "./errors.ts";
import type { Actor, Budget, Meta, Notification, Outcome, Positions, PropertyChange, Request } from "./types.ts";

/**
 * Після затвердження Головою: адміністрація підтверджує закупівлю (нове — на склад бази, закріплене за в/ч),
 * видає його одним актом (нове — в «Отримано», старе із замін — на інший облік) або закриває як не виконано
 * (статус заміни знімається, резерв бюджету вивільняється). Розділ 10 концепції, «Адміністрація».
 */

function assertAdmin(actor: Actor): void {
  if (actor.role.kind !== "admin") throw new DomainError("FORBIDDEN_ROLE", "Закупівлю підтверджує лише адміністрація.");
}

function invalid(message: string, details: Readonly<Record<string, unknown>> = {}): DomainError {
  return new DomainError("INVALID_TRANSITION", message, details);
}

const required = (value: string, what: string): string => {
  const text = value.trim();
  if (text === "") throw new DomainError("NOTE_REQUIRED", `${what} обов'язковий.`, { field: what });
  return text;
};

const toAuthor = (kind: Notification["kind"], request: Request, at: string, note: string | null = null): Notification => ({
  kind,
  audience: { kind: "author", userId: request.authorId },
  requestId: request.id,
  listId: request.listId,
  note,
  at,
});

/** Код нового предмета рядка: для заміни — предмет натомість, інакше — позиція переліку. */
function newCode(request: Request, lineId: string, positions: Positions): string {
  const line = request.lines.find((l) => l.id === lineId);
  if (!line) return "";
  return line.kind === "replacement" ? line.newItem.code : (positions[line.positionId]?.code ?? "");
}

export interface ConfirmProcurementInput {
  readonly request: Request;
  readonly acceptanceDoc: string;
  readonly recipient: string;
  /** Фактично прийнята кількість по кожному рядку: має збігатися із заявкою. */
  readonly quantities: Readonly<Record<string, number>>;
  readonly positions: Positions;
}

/** Підтвердити закупівлю: нове — на складі бази, закріплене за в/ч; заявка — «Виконано». */
export function confirmProcurement(ctx: DomainContext, meta: Meta, input: ConfirmProcurementInput): Outcome {
  assertAdmin(meta.actor);
  const { request } = input;
  guardRevision(meta, request);
  if (request.status !== "extract_issued") {
    throw invalid("Підтвердити закупівлю можна лише для затвердженої заявки з витягом.", { status: request.status });
  }
  const acceptanceDoc = required(input.acceptanceDoc, "Документ приймання");
  const recipient = required(input.recipient, "Отримувач");
  const mismatched = request.lines.filter((l) => input.quantities[l.id] !== l.qty).map((l) => ({ lineId: l.id, expected: l.qty, actual: input.quantities[l.id] ?? null }));
  if (mismatched.length > 0) {
    throw invalid("Фактична кількість не збігається із заявкою: підтвердити не можна — заявку треба змінити.", { reason: "QTY_MISMATCH", lines: mismatched });
  }
  const { at } = stamp(ctx);
  const next = bumped(request, {
    status: "procured" as const,
    procurement: { acceptanceDoc, recipient, procuredAt: at, issueAct: null, issuedAt: null, note: null, byUserId: meta.actor.userId },
  });
  const unitId = request.route[0];
  const property: PropertyChange[] = request.lines.map((line) => ({ unitId, code: newCode(request, line.id, input.positions), tab: "on_base", delta: line.qty }));
  return {
    requests: [next],
    lists: [],
    events: [makeEvent(ctx, meta, { type: "request.procured", requestId: next.id, from: request.status, to: "procured", requestVersion: next.version, revision: next.revision, data: { acceptanceDoc, recipient } })],
    notifications: [toAuthor("request_procured", next, at, `Документ приймання: ${acceptanceDoc}`)],
    property,
  };
}

export interface IssueInput {
  readonly request: Request;
  /** Номер акта видачі: усе нове за заявкою видається одним актом. */
  readonly act: string;
  readonly positions: Positions;
}

/** Видати нове одним актом: нове — в «Отримано»; старе із замін МВО здає, воно йде на інший облік. */
export function issueProcured(ctx: DomainContext, meta: Meta, input: IssueInput): Outcome {
  assertAdmin(meta.actor);
  const { request } = input;
  guardRevision(meta, request);
  if (request.status !== "procured" || !request.procurement) {
    throw invalid("Видати можна лише закуплене, що лежить на складі бази.", { status: request.status });
  }
  const act = required(input.act, "Номер акта");
  const { at } = stamp(ctx);
  const next = bumped(request, { status: "issued" as const, procurement: { ...request.procurement, issueAct: act, issuedAt: at } });
  const unitId = request.route[0];
  const property: PropertyChange[] = request.lines.flatMap((line) => {
    const code = newCode(request, line.id, input.positions);
    const moves: PropertyChange[] = [
      { unitId, code, tab: "on_base", delta: -line.qty },
      { unitId, code, tab: "received", delta: line.qty },
    ];
    // Старе із заміни передається на інший облік: зникає з «Отримано» в/ч.
    if (line.kind === "replacement") {
      const oldCode = input.positions[line.positionId]?.code;
      if (oldCode) moves.push({ unitId, code: oldCode, tab: "received", delta: -line.qty });
    }
    return moves;
  });
  return {
    requests: [next],
    lists: [],
    events: [makeEvent(ctx, meta, { type: "request.issued", requestId: next.id, from: "procured", to: "issued", requestVersion: next.version, revision: next.revision, data: { act } })],
    notifications: [toAuthor("request_issued", next, at, `Акт видачі: ${act}`)],
    property,
  };
}

export interface NotProcuredInput {
  readonly request: Request;
  readonly note: string;
  readonly positions: Positions;
  readonly budget: Budget;
}

/** Закрити як не виконано: закупівля не відбулася — статус заміни знімається, резерв бюджету вивільняється. */
export function closeNotProcured(ctx: DomainContext, meta: Meta, input: NotProcuredInput): Outcome {
  assertAdmin(meta.actor);
  const { request } = input;
  guardRevision(meta, request);
  if (request.status !== "extract_issued") {
    throw invalid("Закрити як не виконано можна лише затверджену заявку з витягом, ще не закуплену.", { status: request.status });
  }
  const note = required(input.note, "Примітка");
  const { at } = stamp(ctx);
  const next = bumped(request, { status: "not_procured" as const, procurement: { acceptanceDoc: null, recipient: null, procuredAt: null, issueAct: null, issuedAt: null, note, byUserId: meta.actor.userId } });
  const impact = requestImpact(request.lines, input.positions);
  const perKekv = Object.fromEntries(
    Object.entries(input.budget.perKekv).map(([kekv, line]) => [kekv, { ...line, approvedMinor: Math.max(0, line.approvedMinor - (impact.perKekv[kekv] ?? 0)) }]),
  );
  const budget: Budget = { total: { ...input.budget.total, approvedMinor: Math.max(0, input.budget.total.approvedMinor - impact.total) }, perKekv };
  return {
    requests: [next],
    lists: [],
    events: [makeEvent(ctx, meta, { type: "request.not_procured", requestId: next.id, from: request.status, to: "not_procured", requestVersion: next.version, revision: next.revision, data: { note, releasedMinor: impact.total } })],
    notifications: [toAuthor("request_not_procured", next, at, note)],
    budget,
  };
}
