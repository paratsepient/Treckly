/**
 * Доменні типи процесу. Чистий TypeScript: без бази, мережі й реального часу.
 * Гроші — цілі копійки (`Money`), кількості — цілі числа.
 */

export type Level = 1 | 2 | 3 | 4 | 5;
export const LEVELS: readonly Level[] = [1, 2, 3, 4, 5];
export const FINAL_LEVEL: Level = 5;

export type IsoDate = string; // YYYY-MM-DD (UTC)
export type IsoTimestamp = string;
export type Kekv = string;
export type UnitId = string;
export type UserId = string;
/** Цілі копійки. */
export type Money = number;

/** Підрозділ на кожному з 5 рівнів: [в/ч, бригада, РУ, Адміністрація по напрямку, Відділ і Голова]. */
export type Route = readonly [UnitId, UnitId, UnitId, UnitId, UnitId];

export type RequestStatus =
  | "draft"
  | "at_level"
  | "in_list"
  | "returned"
  | "approved"
  | "extract_issued"
  | "withdrawn";

export interface NewItem {
  readonly code: string;
  readonly name: string;
  readonly kekv: Kekv;
  readonly priceMinor: Money;
}

interface LineBase {
  readonly id: string;
  /** Позиція Попереднього переліку напрямку. */
  readonly positionId: string;
  readonly qty: number;
  /** КЕКВ, який вказав автор; має збігатися з КЕКВ позиції. */
  readonly kekv: Kekv;
}

export interface ByListLine extends LineBase {
  readonly kind: "by_list";
}

/** Заміна: позиція переліку замінюється на інший предмет тієї ж кількості. */
export interface ReplacementLine extends LineBase {
  readonly kind: "replacement";
  readonly newItem: NewItem;
}

export type RequestLine = ByListLine | ReplacementLine;

export type LineStatus =
  | "awaits_approval"
  | "approved"
  | "awaits_replacement_approval"
  | "replacement_agreed";

export type Audience =
  | { readonly kind: "author"; readonly userId: UserId }
  | {
      readonly kind: "level";
      readonly level: Level;
      readonly unitId: UnitId;
      readonly role: "preparer" | "approver" | "both";
    };

export interface ReturnInfo {
  /** Рівень, який повернув заявку. */
  readonly level: Level;
  readonly note: string;
  readonly byUserId: UserId;
  readonly at: IsoTimestamp;
  /** Каскад сповіщень згори вниз: рівні L-1…1, потім автор. */
  readonly cascade: readonly Audience[];
}

export interface Request {
  readonly id: string;
  readonly authorId: UserId;
  readonly route: Route;
  /** Версія документа: після повернення автор подає нову версію (2, 3, …). */
  readonly version: number;
  /** Лічильник змін запису для оптимістичного блокування (VERSION_CONFLICT). */
  readonly revision: number;
  readonly status: RequestStatus;
  /** Поточний рівень: заповнений для `at_level` і `in_list`. */
  readonly level: Level | null;
  /** Денний перелік: для `in_list`, а після затвердження — остаточний перелік. */
  readonly listId: string | null;
  readonly lines: readonly RequestLine[];
  readonly returnInfo: ReturnInfo | null;
  /** З якого дня заявка на поточному рівні (для лічильника днів). */
  readonly levelEnteredOn: IsoDate | null;
  readonly createdOn: IsoDate;
}

export type DailyListStatus = "formed" | "approved" | "disbanded";

export interface DailyList {
  readonly id: string;
  readonly level: Level;
  readonly unitId: UnitId;
  readonly date: IsoDate;
  readonly status: DailyListStatus;
  readonly requestIds: readonly string[];
  readonly formedBy: UserId;
  readonly sedoNumber: number | null;
  readonly approvedBy: UserId | null;
  readonly revision: number;
}

export interface Position {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly kekv: Kekv;
  readonly priceMinor: Money;
  /** Доступна кількість за переліком напрямку. */
  readonly availableQty: number;
}

export type Positions = Readonly<Record<string, Position>>;

export interface BudgetLine {
  readonly limitMinor: Money;
  /** Зарезервовано затвердженими заявками. */
  readonly approvedMinor: Money;
}

export interface Budget {
  readonly total: BudgetLine;
  readonly perKekv: Readonly<Record<Kekv, BudgetLine>>;
}

export interface Extract {
  readonly id: string;
  readonly unitId: UnitId;
  readonly date: IsoDate;
  readonly requestIds: readonly string[];
  readonly lines: readonly {
    readonly requestId: string;
    readonly lineId: string;
    readonly positionId: string;
    readonly qty: number;
    readonly kind: RequestLine["kind"];
    readonly status: LineStatus;
  }[];
}

export type Role =
  | { readonly kind: "author"; readonly unitId: UnitId }
  | { readonly kind: "preparer"; readonly level: Level; readonly unitId: UnitId }
  | { readonly kind: "approver"; readonly level: Level; readonly unitId: UnitId }
  | { readonly kind: "system" };

export interface Actor {
  readonly userId: UserId;
  readonly role: Role;
}

/** Метадані команди: хто, ключ ідемпотентності, очікувані версії записів. */
export interface Meta {
  readonly actor: Actor;
  readonly idempotencyKey: string;
  readonly expectedRevisions?: Readonly<Record<string, number>>;
}

export type EventType =
  | "request.created"
  | "request.edited"
  | "request.submitted"
  | "request.resubmitted"
  | "request.returned"
  | "request.withdrawn"
  | "request.listed"
  | "request.delisted"
  | "request.advanced"
  | "request.approved"
  | "request.extract_issued"
  | "list.formed"
  | "list.disbanded"
  | "list.approved";

/** Запис журналу (лише доповнюється). */
export interface JournalEvent {
  readonly type: EventType;
  readonly at: IsoTimestamp;
  readonly actorId: UserId;
  readonly idempotencyKey: string;
  readonly requestId: string | null;
  readonly listId: string | null;
  readonly from: RequestStatus | null;
  readonly to: RequestStatus | null;
  readonly requestVersion: number | null;
  readonly revision: number | null;
  readonly data: Readonly<Record<string, unknown>>;
}

export type NotificationKind =
  | "request_submitted"
  | "request_advanced"
  | "list_formed"
  | "request_returned"
  | "request_withdrawn"
  | "request_approved"
  | "extract_issued"
  | "reminder";

export interface Notification {
  readonly kind: NotificationKind;
  readonly audience: Audience;
  readonly requestId: string;
  readonly listId: string | null;
  readonly note: string | null;
  readonly at: IsoTimestamp;
}

/** Результат команди: усе, що треба записати в одній транзакції. */
export interface Outcome {
  readonly requests: readonly Request[];
  readonly lists: readonly DailyList[];
  readonly events: readonly JournalEvent[];
  readonly notifications: readonly Notification[];
  /** Новий стан бюджету (лише при затвердженні Головою). */
  readonly budget?: Budget;
  readonly extracts?: readonly Extract[];
}
