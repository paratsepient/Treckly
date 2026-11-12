ALTER TABLE "request_lines" ADD COLUMN "condition" text;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "service" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "funding" text DEFAULT 'general' NOT NULL;