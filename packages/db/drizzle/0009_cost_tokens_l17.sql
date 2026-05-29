ALTER TABLE "agents" ADD COLUMN "cost_cap_minor" integer;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "cost_cap_currency" text;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "cost_cap_minor" integer;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "cost_cap_currency" text;--> statement-breakpoint
ALTER TABLE "bets" ALTER COLUMN "appetite" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "bets" ADD COLUMN "cost_appetite_minor" integer;--> statement-breakpoint
ALTER TABLE "bets" ADD COLUMN "cost_appetite_currency" text;--> statement-breakpoint
ALTER TABLE "bets" ADD COLUMN "cost_actual_minor" integer;--> statement-breakpoint
ALTER TABLE "bets" ADD COLUMN "cost_actual_currency" text;--> statement-breakpoint
ALTER TABLE "bets" ADD COLUMN "tokens_actual_json" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "cost_minor" integer;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "cost_currency" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "tokens_json" text;
