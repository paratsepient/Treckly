import { bigint, index, integer, jsonb, pgTable, primaryKey, serial, text } from "drizzle-orm/pg-core";
import type { Audience, JournalEvent, ReturnInfo, Procurement } from "@dsp/domain";

/**
 * Схема прототипу. Та сама схема піде на PostgreSQL пілоту (міграції — у `migrations/`).
 * Гроші — цілі копійки (`bigint` у режимі number), дати — текст ISO (UTC).
 */

/** Структура: орган (Відділ оборонних ресурсів і Голова) → напрямок → РУ → бригада → в/ч → відділ. */
export const units = pgTable("units", {
  id: text("id").primaryKey(),
  parentId: text("parent_id"),
  kind: text("kind").$type<"authority" | "direction" | "ru" | "brigade" | "unit" | "department">().notNull(),
  name: text("name").notNull(),
});

/** Користувачі прототипу: роль обирають перемикачем, без паролів. */
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  roleKind: text("role_kind").$type<"author" | "preparer" | "approver" | "admin">().notNull(),
  level: integer("level"),
  unitId: text("unit_id"),
  /** Посада (налаштування: на рівнях 2–3 хто саме діє — невідомо). */
  title: text("title").notNull(),
});

export const kekv = pgTable("kekv", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
});

/** Номенклатура: предмети, у тому числі кандидати для замін. */
export const nomenclature = pgTable("nomenclature", {
  id: text("id").primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  kekv: text("kekv").notNull(),
  priceMinor: bigint("price_minor", { mode: "number" }).notNull(),
  measure: text("measure").notNull(),
  /** Група схожих предметів: кандидати для замін беруться з тієї ж групи. */
  groupKey: text("group_key").notNull(),
});

/** Позиції Попереднього переліку 2027 (прив'язаного до напрямку). */
export const listPositions = pgTable("list_positions", {
  id: text("id").primaryKey(),
  directionId: text("direction_id").notNull(),
  itemId: text("item_id").notNull(),
  plannedQty: integer("planned_qty").notNull(),
});

/** Бюджет напрямку: рядок TOTAL (загальний) і по одному на КЕКВ. */
export const budgets = pgTable(
  "budgets",
  {
    directionId: text("direction_id").notNull(),
    scope: text("scope").notNull(),
    limitMinor: bigint("limit_minor", { mode: "number" }).notNull(),
    approvedMinor: bigint("approved_minor", { mode: "number" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.directionId, t.scope] })],
);

export const requests = pgTable(
  "requests",
  {
    id: text("id").primaryKey(),
    authorId: text("author_id").notNull(),
    directionId: text("direction_id").notNull(),
    /** Підрозділ на кожному з 5 рівнів. */
    route: jsonb("route").$type<string[]>().notNull(),
    version: integer("version").notNull(),
    revision: integer("revision").notNull(),
    status: text("status").notNull(),
    level: integer("level"),
    listId: text("list_id"),
    justification: text("justification").notNull().default(""),
    title: text("title").notNull().default(""),
    service: text("service").notNull().default(""),
    funding: text("funding").$type<"general" | "special">().notNull().default("general"),
    returnInfo: jsonb("return_info").$type<ReturnInfo>(),
    sedoNumber: bigint("sedo_number", { mode: "number" }),
    procurement: jsonb("procurement").$type<Procurement>(),
    levelEnteredOn: text("level_entered_on"),
    createdOn: text("created_on").notNull(),
  },
  (t) => [index("requests_status_idx").on(t.status, t.level)],
);

export const requestLines = pgTable(
  "request_lines",
  {
    id: text("id").notNull(),
    requestId: text("request_id").notNull(),
    ord: integer("ord").notNull(),
    kind: text("kind").$type<"by_list" | "replacement">().notNull(),
    positionId: text("position_id").notNull(),
    qty: integer("qty").notNull(),
    kekv: text("kekv").notNull(),
    newItem: jsonb("new_item").$type<{ code: string; name: string; kekv: string; priceMinor: number }>(),
    condition: text("condition").$type<"unusable" | "needs_repair" | "lost">(),
  },
  (t) => [primaryKey({ columns: [t.requestId, t.id] })],
);

export const dailyLists = pgTable("daily_lists", {
  id: text("id").primaryKey(),
  level: integer("level").notNull(),
  unitId: text("unit_id").notNull(),
  date: text("date").notNull(),
  status: text("status").$type<"formed" | "approved" | "disbanded">().notNull(),
  formedBy: text("formed_by").notNull(),
  sedoNumber: bigint("sedo_number", { mode: "number" }),
  approvedBy: text("approved_by"),
  revision: integer("revision").notNull(),
});

export const dailyListRequests = pgTable(
  "daily_list_requests",
  {
    listId: text("list_id").notNull(),
    requestId: text("request_id").notNull(),
    ord: integer("ord").notNull(),
  },
  (t) => [primaryKey({ columns: [t.listId, t.requestId] })],
);

/** Витяги по в/ч (формуються після затвердження Головою). */
export const extracts = pgTable("extracts", {
  id: text("id").primaryKey(),
  unitId: text("unit_id").notNull(),
  date: text("date").notNull(),
});

export const extractLines = pgTable(
  "extract_lines",
  {
    extractId: text("extract_id").notNull(),
    requestId: text("request_id").notNull(),
    lineId: text("line_id").notNull(),
    positionId: text("position_id").notNull(),
    qty: integer("qty").notNull(),
    kind: text("kind").$type<"by_list" | "replacement">().notNull(),
    status: text("status").notNull(),
  },
  (t) => [primaryKey({ columns: [t.extractId, t.requestId, t.lineId] })],
);

export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    kind: text("kind").notNull(),
    audience: jsonb("audience").$type<Audience>().notNull(),
    /** Для швидкого відбору «мої сповіщення»: автор — userId, рівень — level і unitId. */
    audienceUserId: text("audience_user_id"),
    audienceLevel: integer("audience_level"),
    audienceUnitId: text("audience_unit_id"),
    audienceRole: text("audience_role"),
    requestId: text("request_id").notNull(),
    listId: text("list_id"),
    note: text("note"),
    at: text("at").notNull(),
    readAt: text("read_at"),
  },
  (t) => [index("notifications_user_idx").on(t.audienceUserId), index("notifications_level_idx").on(t.audienceLevel, t.audienceUnitId)],
);

/** Журнал дій: лише доповнюється (UPDATE і DELETE забороняє тригер у міграції). */
export const journal = pgTable(
  "journal",
  {
    seq: serial("seq").primaryKey(),
    at: text("at").notNull(),
    type: text("type").notNull(),
    requestId: text("request_id"),
    listId: text("list_id"),
    actorId: text("actor_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    data: jsonb("data").$type<JournalEvent>().notNull(),
  },
  (t) => [index("journal_request_idx").on(t.requestId)],
);

/** Збережені відповіді на команди: повторний запит із тим самим ключем повертає ту саму відповідь. */
export const idempotencyKeys = pgTable("idempotency_keys", {
  key: text("key").primaryKey(),
  status: integer("status").notNull(),
  response: jsonb("response").notNull(),
});

/** Симульований «сьогодні» (кнопка «Наступний день»). Один рядок з id = 1. */
export const demoState = pgTable("demo_state", {
  id: integer("id").primaryKey(),
  now: text("now").notNull(),
});

/** «Моє майно» в/ч: вкладки «заплановано», «на базі», «отримано». */
export const propertyItems = pgTable("property_items", {
  id: text("id").primaryKey(),
  unitId: text("unit_id").notNull(),
  itemId: text("item_id").notNull(),
  tab: text("tab").$type<"planned" | "on_base" | "received">().notNull(),
  qty: integer("qty").notNull(),
});
