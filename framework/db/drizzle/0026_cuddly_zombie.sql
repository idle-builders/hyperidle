ALTER TABLE "bets" ADD COLUMN "outcome_verdict" text;--> statement-breakpoint
ALTER TABLE "bets" ADD COLUMN "outcome_summary" text;--> statement-breakpoint
ALTER TABLE "bets" ADD COLUMN "outcome_recorded_at" text;--> statement-breakpoint
ALTER TABLE "bets" ADD COLUMN "outcome_recorded_by" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "effectiveness_score" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "effectiveness_recorded_at" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "effectiveness_recorded_by" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "outcome_verdict" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "outcome_recorded_at" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "outcome_recorded_by" text;