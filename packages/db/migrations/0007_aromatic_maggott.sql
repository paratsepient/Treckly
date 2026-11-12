CREATE TABLE "acting" (
	"id" text PRIMARY KEY NOT NULL,
	"deputy_id" text NOT NULL,
	"principal_id" text NOT NULL,
	"assigned_by" text NOT NULL,
	"assigned_at" text NOT NULL,
	"revoked_at" text
);
