/**
 * Доменні типи процесу. Чистий TypeScript: без бази, мережі й реального часу.
 * Гроші — цілі копійки (`Money`), кількості — цілі числа.
 */

export type Level = 1 | 2 | 3 | 4 | 5;
export const LEVELS: readonly Level[] = [1, 2, 3, 4, 5];
export const FINAL_LEVEL: Level = 5;

/**
 * Хто відмічає погодження переліку рівня: керівник рівня, а на рівні 5 — Відділ оборонних ресурсів.
 * Голова підписує остаточний перелік на папері; Відділ друкує його, несе на підпис і відмічає
 * «Підписано Головою» з номером СЕДО. У системі Голова лише стежить (рішення користувача 2026-11-12).
 */
export const signerKind = (level: Level): "preparer" | "approver" => (level === FINAL_LEVEL ? "preparer" : "approver");

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
  /** Закупівлю підтверджено: нове на складі бази, закріплене за в/ч («Виконано»). */
  | "procured"
  /** Нове видано в/ч одним актом, старе із замін передано на інший облік. */
  | "issued"
  /** Закупівля не відбулася: статус заміни знято, резерв бюджету вивільнено. */
  | "not_procured"
  | "withdrawn";

/** Статуси, у яких заявка затверджена Головою й тримає резерв бюджету. */
export const APPROVED_STATUSES: readonly RequestStatus[] = ["approved", "extract_issued", "procured", "issued"];
export const isApprovedStatus = (status: RequestStatus): boolean => APPROVED_STATUSES.includes(status);

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

/** Джерело фінансування заявки. */
export type FundingSource = "general" | "special";
export const FUNDING_SOURCES: readonly FundingSource[] = ["general", "special"];

/** Стан майна, яке замінюють (рядок заміни): без нього заміну не подати. */
export type OldCondition = "unusable" | "needs_repair" | "lost";
export const OLD_CONDITIONS: readonly OldCondition[] = ["unusable", "needs_repair", "lost"];

export interface ByListLine extends LineBase {
  readonly kind: "by_list";
}

/** Заміна: позиція переліку замінюється на інший предмет тієї ж кількості. */
export interface ReplacementLine extends LineBase {
  readonly kind: "replacement";
  readonly newItem: NewItem;
  /** Стан майна, яке замінюють; обов'язковий при поданні. */
  readonly condition?: OldCondition;
}

export type RequestLine = ByListLine | ReplacementLine;

export type LineStatus =
  | "awaits_approval"
  | "approved"
  | "awaits_replacement_approval"
  | "replacement_agreed"
  /** Закуплено (рядок за переліком після підтвердження закупівлі). */
  | "purchased"
  /** Замінено (рядок заміни після підтвердження закупівлі). */
  | "replaced"
  /** Не виконано: закупівля не відбулася. */
  | "not_procured";

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
  /** Обґрунтування потреби: автор пише його сам, решта рапорту — шаблон. */
  readonly justification: string;
  /** Назва заявки від автора (необов'язкова): щоб у списках її було легко впізнати. */
  readonly title: string;
  /** Служба (відділ), для потреб якої замовляють; обов'язкова при поданні. */
  readonly service: string;
  /** Джерело фінансування. */
  readonly funding: FundingSource;
  readonly returnInfo: ReturnInfo | null;
  /** Реєстраційний номер рапорту в СЕДО: автор реєструє рапорт і вводить номер при поданні (кожна версія — новий номер). */
  readonly sedoNumber: number | null;
  /** Закупівля й видача після затвердження Головою (адміністрація); null — ще не було. */
  readonly procurement: Procurement | null;
  /** З якого дня заявка на поточному рівні (для лічильника днів). */
  readonly levelEnteredOn: IsoDate | null;
  readonly createdOn: IsoDate;
}

/** Закупівля після затвердження: документ приймання, отримувач, видача одним актом або примітка про зрив. */
export interface Procurement {
  readonly acceptanceDoc: string | null;
  readonly recipient: string | null;
  readonly procuredAt: IsoTimestamp | null;
  readonly issueAct: string | null;
  readonly issuedAt: IsoTimestamp | null;
  /** Примітка, чому закупівля не відбулася. */
  readonly note: string | null;
  readonly byUserId: UserId;
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
  /** Адміністрація: підтверджує закупівлю, видає нове, закриває як не виконано. */
  | { readonly kind: "admin" }
  | { readonly kind: "system" };

export interface Actor {
  readonly userId: UserId;
  readonly role: Role;
  /** ТВО: чиї обов'язки особа зараз виконує (роль — того, кого заміщає). */
  readonly actingFor?: UserId;
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
  | "request.procured"
  | "request.issued"
  | "request.not_procured"
  | "list.formed"
  | "list.disbanded"
  /** Голова не підписав остаточний перелік: заявки повернуто авторам. */
  | "list.not_signed"
  | "list.approved"
  | "acting.assigned"
  | "acting.revoked";

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
  | "request_procured"
  | "request_issued"
  | "request_not_procured"
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
  /** Зміни в майні в/ч (вкладки «На базі» й «Отримано»): за кодом предмета, з плюсом або мінусом. */
  readonly property?: readonly PropertyChange[];
}

export interface PropertyChange {
  readonly unitId: UnitId;
  readonly code: string;
  readonly tab: "on_base" | "received";
  readonly delta: number;
}
