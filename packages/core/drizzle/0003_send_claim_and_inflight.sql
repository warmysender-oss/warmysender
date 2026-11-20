ALTER TABLE "mailboxes" ADD COLUMN "consecutive_policy_failures" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "mailboxes" ADD COLUMN "send_claim_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "send_started_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "messages_enrollment_step_unique" ON "messages" USING btree ("enrollment_id","step_id");--> statement-breakpoint
ALTER TABLE "mailboxes" ADD CONSTRAINT "mailboxes_policy_failures_chk" CHECK ("mailboxes"."consecutive_policy_failures" >= 0);