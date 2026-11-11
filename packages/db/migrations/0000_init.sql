CREATE TABLE "budgets" (
	"direction_id" text NOT NULL,
	"scope" text NOT NULL,
	"limit_minor" bigint NOT NULL,
	"approved_minor" bigint NOT NULL,
	CONSTRAINT "budgets_direction_id_scope_pk" PRIMARY KEY("direction_id","scope")
);
--> statement-breakpoint
CREATE TABLE "daily_list_requests" (
	"list_id" text NOT NULL,
	"request_id" text NOT NULL,
	"ord" integer NOT NULL,
	CONSTRAINT "daily_list_requests_list_id_request_id_pk" PRIMARY KEY("list_id","request_id")
);
--> statement-breakpoint
CREATE TABLE "daily_lists" (
	"id" text PRIMARY KEY NOT NULL,
	"level" integer NOT NULL,
	"unit_id" text NOT NULL,
	"date" text NOT NULL,
	"status" text NOT NULL,
	"formed_by" text NOT NULL,
	"sedo_number" bigint,
	"approved_by" text,
	"revision" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "demo_state" (
	"id" integer PRIMARY KEY NOT NULL,
	"now" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extract_lines" (
	"extract_id" text NOT NULL,
	"request_id" text NOT NULL,
	"line_id" text NOT NULL,
	"position_id" text NOT NULL,
	"qty" integer NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	CONSTRAINT "extract_lines_extract_id_request_id_line_id_pk" PRIMARY KEY("extract_id","request_id","line_id")
);
--> statement-breakpoint
CREATE TABLE "extracts" (
	"id" text PRIMARY KEY NOT NULL,
	"unit_id" text NOT NULL,
	"date" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"key" text PRIMARY KEY NOT NULL,
	"status" integer NOT NULL,
	"response" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal" (
	"seq" serial PRIMARY KEY NOT NULL,
	"at" text NOT NULL,
	"type" text NOT NULL,
	"request_id" text,
	"list_id" text,
	"actor_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kekv" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "list_positions" (
	"id" text PRIMARY KEY NOT NULL,
	"direction_id" text NOT NULL,
	"item_id" text NOT NULL,
	"planned_qty" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nomenclature" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"kekv" text NOT NULL,
	"price_minor" bigint NOT NULL,
	"measure" text NOT NULL,
	"group_key" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"audience" jsonb NOT NULL,
	"audience_user_id" text,
	"audience_level" integer,
	"audience_unit_id" text,
	"audience_role" text,
	"request_id" text NOT NULL,
	"list_id" text,
	"note" text,
	"at" text NOT NULL,
	"read_at" text
);
--> statement-breakpoint
CREATE TABLE "property_items" (
	"id" text PRIMARY KEY NOT NULL,
	"unit_id" text NOT NULL,
	"item_id" text NOT NULL,
	"tab" text NOT NULL,
	"qty" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_lines" (
	"id" text NOT NULL,
	"request_id" text NOT NULL,
	"ord" integer NOT NULL,
	"kind" text NOT NULL,
	"position_id" text NOT NULL,
	"qty" integer NOT NULL,
	"kekv" text NOT NULL,
	"new_item" jsonb,
	CONSTRAINT "request_lines_request_id_id_pk" PRIMARY KEY("request_id","id")
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"id" text PRIMARY KEY NOT NULL,
	"author_id" text NOT NULL,
	"direction_id" text NOT NULL,
	"route" jsonb NOT NULL,
	"version" integer NOT NULL,
	"revision" integer NOT NULL,
	"status" text NOT NULL,
	"level" integer,
	"list_id" text,
	"return_info" jsonb,
	"level_entered_on" text,
	"created_on" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" text PRIMARY KEY NOT NULL,
	"parent_id" text,
	"kind" text NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"role_kind" text NOT NULL,
	"level" integer,
	"unit_id" text,
	"title" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "journal_request_idx" ON "journal" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("audience_user_id");--> statement-breakpoint
CREATE INDEX "notifications_level_idx" ON "notifications" USING btree ("audience_level","audience_unit_id");--> statement-breakpoint
CREATE INDEX "requests_status_idx" ON "requests" USING btree ("status","level");