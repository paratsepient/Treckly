ALTER TABLE "users" ADD COLUMN "department_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "kekvs" jsonb DEFAULT '[]'::jsonb NOT NULL;