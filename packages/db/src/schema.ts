import { integer, jsonb, pgTable, serial, text } from "drizzle-orm/pg-core";
import type { JournalEvent, Request } from "@dsp/domain";

/**
 * Тимчасова схема етапу 0 (перевірка Hono + PGlite). Повна схема з переліками,
 * бюджетом і довідниками з'явиться в ітерації 1 разом із міграціями.
 */
export const requests = pgTable("requests", {
  id: text("id").primaryKey(),
  revision: integer("revision").notNull(),
  status: text("status").notNull(),
  body: jsonb("body").$type<Request>().notNull(),
});

/** Журнал: лише доповнюється (UPDATE і DELETE заборонені тригером у bootstrap.ts). */
export const journal = pgTable("journal", {
  seq: serial("seq").primaryKey(),
  at: text("at").notNull(),
  type: text("type").notNull(),
  requestId: text("request_id"),
  listId: text("list_id"),
  actorId: text("actor_id").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  data: jsonb("data").$type<JournalEvent>().notNull(),
});

/** Збережені відповіді на команди: повторний запит із тим самим ключем повертає ту саму відповідь. */
export const idempotencyKeys = pgTable("idempotency_keys", {
  key: text("key").primaryKey(),
  status: integer("status").notNull(),
  response: jsonb("response").notNull(),
});
