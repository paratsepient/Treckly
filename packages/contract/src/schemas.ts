import { z } from "zod";

/**
 * Zod-схеми сутностей. Форма збігається з типами `@dsp/domain` (перевіряється
 * на рівні типів у tests/parity.test.ts): контракт — єдине джерело правди для
 * форм, API і майбутнього сервера пілоту.
 */

export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Дата у форматі РРРР-ММ-ДД");
export const IsoTimestamp = z.iso.datetime();
export const Level = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]);
export const Kekv = z.string().min(1);
/** Цілі копійки. */
export const Money = z.number().int();
export const Id = z.string().min(1);

export const RequestStatus = z.enum(["draft", "at_level", "in_list", "returned", "approved", "extract_issued", "procured", "issued", "not_procured", "withdrawn"]);
export const LineStatus = z.enum(["awaits_approval", "approved", "awaits_replacement_approval", "replacement_agreed", "purchased", "replaced", "not_procured"]);
export const DailyListStatus = z.enum(["formed", "approved", "disbanded", "not_signed"]);

export const ErrorCode = z.enum([
  "NOT_IN_LIST",
  "QTY_EXCEEDED",
  "KEKV_MISMATCH",
  "BUDGET_EXCEEDED",
  "INVALID_TRANSITION",
  "FORBIDDEN_ROLE",
  "VERSION_CONFLICT",
  "SEDO_NUMBER_INVALID",
  "NOTE_REQUIRED",
  "POSITION_BUSY",
  "REPLACEMENT_OVER_SUM",
  // Службові коди транспорту (не з домену):
  "VALIDATION",
  "NOT_FOUND",
  "INTERNAL",
]);

export const ErrorResponse = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

/** Предмет натомість: найменування, кількість і сума від автора; код — після погодження Головою (до того порожній). */
export const NewItem = z.object({
  code: z.string(),
  name: z.string(),
  kekv: Kekv,
  qty: z.number().int().nonnegative(),
  totalMinor: Money.nonnegative(),
  measure: z.string(),
});

const lineBase = {
  id: Id,
  positionId: Id,
  qty: z.number().int(),
  kekv: Kekv,
};

export const ByListLine = z.object({ kind: z.literal("by_list"), ...lineBase });
export const FundingSource = z.enum(["general", "special"]);
export const OldCondition = z.enum(["unusable", "needs_repair", "lost"]);
export const ReplacementLine = z.object({ kind: z.literal("replacement"), ...lineBase, newItem: NewItem, condition: OldCondition.optional(), newPositionId: Id.optional() });
export const RequestLine = z.discriminatedUnion("kind", [ByListLine, ReplacementLine]);

export const Route = z.tuple([Id, Id, Id, Id, Id]);

export const Audience = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("author"), userId: Id }),
  z.object({ kind: z.literal("level"), level: Level, unitId: Id, role: z.enum(["preparer", "approver", "both"]) }),
]);

export const ReturnInfo = z.object({
  level: Level,
  note: z.string().min(1),
  byUserId: Id,
  at: IsoTimestamp,
  cascade: z.array(Audience),
  reason: z.literal("not_signed").optional(),
});

export const Procurement = z.object({
  acceptanceDoc: z.string().nullable(),
  recipient: z.string().nullable(),
  procuredAt: IsoTimestamp.nullable(),
  issueAct: z.string().nullable(),
  issuedAt: IsoTimestamp.nullable(),
  note: z.string().nullable(),
  byUserId: Id,
});

export const Request = z.object({
  id: Id,
  authorId: Id,
  route: Route,
  version: z.number().int().positive(),
  revision: z.number().int().positive(),
  status: RequestStatus,
  level: Level.nullable(),
  listId: Id.nullable(),
  lines: z.array(RequestLine),
  justification: z.string(),
  title: z.string(),
  service: z.string(),
  funding: FundingSource,
  returnInfo: ReturnInfo.nullable(),
  sedoNumber: z.number().int().nullable(),
  /** Перевірка заміни на рівні: «Відповідає вимогам» (діє лише на цьому рівні). */
  kekvCheck: z.object({ level: Level, byUserId: Id, at: IsoTimestamp }).nullable(),
  procurement: Procurement.nullable(),
  levelEnteredOn: IsoDate.nullable(),
  createdOn: IsoDate,
});

export const DailyList = z.object({
  id: Id,
  level: Level,
  unitId: Id,
  date: IsoDate,
  status: DailyListStatus,
  requestIds: z.array(Id),
  formedBy: Id,
  sedoNumber: z.number().int().positive().nullable(),
  approvedBy: Id.nullable(),
  revision: z.number().int().positive(),
});

export const Position = z.object({
  id: Id,
  code: z.string(),
  name: z.string(),
  kekv: Kekv,
  priceMinor: Money,
  /** Доступна кількість за переліком напрямку. */
  availableQty: z.number().int(),
});

export const BudgetLine = z.object({ limitMinor: Money, approvedMinor: Money });
export const Budget = z.object({ total: BudgetLine, perKekv: z.record(Kekv, BudgetLine) });

export const NotificationKind = z.enum([
  "request_submitted",
  "request_advanced",
  "list_formed",
  "request_returned",
  "request_withdrawn",
  "request_approved",
  "extract_issued",
  "request_procured",
  "request_issued",
  "request_not_procured",
  "reminder",
]);

export const Notification = z.object({
  kind: NotificationKind,
  audience: Audience,
  requestId: Id,
  listId: Id.nullable(),
  note: z.string().nullable(),
  at: IsoTimestamp,
});

export const ExtractLine = z.object({
  requestId: Id,
  lineId: Id,
  positionId: Id,
  qty: z.number().int(),
  kind: z.enum(["by_list", "replacement"]),
  status: LineStatus,
});

export const Extract = z.object({
  id: Id,
  unitId: Id,
  date: IsoDate,
  requestIds: z.array(Id),
  lines: z.array(ExtractLine),
});

export const JournalEvent = z.object({
  type: z.string(),
  at: IsoTimestamp,
  actorId: Id,
  idempotencyKey: z.string(),
  requestId: Id.nullable(),
  listId: Id.nullable(),
  from: RequestStatus.nullable(),
  to: RequestStatus.nullable(),
  requestVersion: z.number().int().nullable(),
  revision: z.number().int().nullable(),
  data: z.record(z.string(), z.unknown()),
});

// ── Користувачі, структура, довідники ─────────────────────────────────────────

export const RoleKind = z.enum(["author", "preparer", "approver", "admin"]);

export const User = z.object({
  id: Id,
  name: z.string(),
  roleKind: RoleKind,
  level: Level.nullable(),
  unitId: Id.nullable(),
  title: z.string(),
  departmentId: Id.nullable(),
  kekvs: z.array(Kekv),
});

export const ActingAssignment = z.object({
  id: Id,
  deputyId: Id,
  principalId: Id,
  assignedBy: Id,
  assignedAt: z.string(),
  revokedAt: z.string().nullable(),
});

export const UnitKind = z.enum(["authority", "direction", "ru", "brigade", "unit", "department"]);
export const Unit = z.object({ id: Id, parentId: Id.nullable(), kind: UnitKind, name: z.string() });

export const KekvInfo = z.object({ code: Kekv, name: z.string() });
export const Item = z.object({ id: Id, code: z.string(), name: z.string(), kekv: Kekv, priceMinor: Money, measure: z.string(), group: z.string() });

export const LevelConfig = z.object({ level: Level, name: z.string(), preparerTitle: z.string(), approverTitle: z.string() });

export const PropertyTab = z.enum(["planned", "on_base", "received"]);
export const PropertyItem = z.object({ id: Id, unitId: Id, item: Item, tab: PropertyTab, qty: z.number().int() });

// ── Похідні подання ───────────────────────────────────────────────────────────

/** Бюджет по КЕКВ: затверджено, у роботі, залишок. */
export const BudgetSummaryLine = z.object({
  scope: z.union([z.literal("TOTAL"), Kekv]),
  limitMinor: Money,
  /** Затверджено разом із купленим (резерв під підписані Головою заявки). */
  approvedMinor: Money,
  /** З них куплено (закупівлю підтверджено або видано). */
  boughtMinor: Money,
  /** У заявках на рівнях і в переліках (для автоперевірок). */
  inWorkMinor: Money,
  /** У заявках разом із поверненими авторам (для показу стану плану). */
  inRequestsMinor: Money,
  /** Ліміт мінус затверджене й куплене. */
  remainingMinor: Money,
});
export const BudgetSummary = z.object({ lines: z.array(BudgetSummaryLine) });

export const CheckIssue = z.object({
  code: ErrorCode,
  lineId: Id.nullable(),
  message: z.string(),
  details: z.record(z.string(), z.unknown()),
});
export const BudgetImpact = z.object({ perKekv: z.record(Kekv, Money), total: Money });
export const CheckReport = z.object({
  ok: z.boolean(),
  errors: z.array(CheckIssue),
  warnings: z.array(CheckIssue),
  impact: BudgetImpact,
  inWork: BudgetImpact,
});

export const TrackStepState = z.enum(["done", "current", "pending", "returned"]);
/** Трек 5 рівнів для ініціатора і реєстру: де зараз заявка і скільки днів вона там. */
export const TrackStep = z.object({
  level: Level,
  state: TrackStepState,
  enteredOn: IsoDate.nullable(),
  daysAtLevel: z.number().int().nullable(),
  sedoNumber: z.number().int().nullable(),
  /** Заявка в сформованому переліку цього рівня (чекає погодження керівника). */
  inList: z.boolean(),
});
export const RequestTrack = z.object({ steps: z.tuple([TrackStep, TrackStep, TrackStep, TrackStep, TrackStep]) });

export const RequestDetail = z.object({
  request: Request,
  lineStatuses: z.record(Id, LineStatus),
  track: RequestTrack,
  journal: z.array(JournalEvent),
});

/** Позиція запланованого переліку закупівель напрямку: скільки заплановано, зарезервовано, у роботі й розподілено по в/ч. */
export const PlannedPosition = z.object({
  id: Id,
  code: z.string(),
  name: z.string(),
  kekv: Kekv,
  priceMinor: Money,
  measure: z.string(),
  /** Заплановано: на рівнях 4–5 — за переліком напрямку, нижче — сума планів в/ч зони відповідальності. */
  plannedQty: z.number().int(),
  /**
   * Стани плану (кожна одиниця — рівно в одному; план = вільно + у заявках + затверджено + куплено):
   * у заявках — іде погодженням або повернута; затверджено — Голова підписав, чекає закупівлі;
   * куплено — закупівлю підтверджено (з них видано в/ч — `issuedQty`); вільно — ще ніхто не замовив (може бути < 0, якщо понад план).
   */
  inRequestsQty: z.number().int(),
  approvedQty: z.number().int(),
  boughtQty: z.number().int(),
  issuedQty: z.number().int(),
  freeQty: z.number().int(),
  /** Заплановано в в/ч зони: хто скільки може замовити. */
  units: z.array(z.object({ unitId: Id, qty: z.number().int() })),
});
/** Зона відповідальності: підрозділ користувача і в/ч під ним; на рівнях 4–5 — увесь напрямок. */
export const PlannedScope = z.object({ unitId: Id, level: Level, wholeDirection: z.boolean(), unitIds: z.array(Id) });
export const PlannedList = z.object({ scope: PlannedScope, positions: z.array(PlannedPosition) });

export const Kpi = z.object({
  byStatus: z.record(RequestStatus, z.number().int()),
  /** Середня кількість днів на рівні, по рівнях 1–5. */
  avgDaysByLevel: z.record(z.string(), z.number()),
  returnShare: z.number().min(0).max(1),
  budgetByKekv: z.array(BudgetSummaryLine),
});
