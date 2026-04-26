-- L1: per-pair autonomy audit (docs/plans/L1.md Decision 3) — Postgres dialect.
ALTER TABLE "agent_skills" ADD COLUMN "updated_at" text DEFAULT '1970-01-01T00:00:00.000Z' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_skills" ADD COLUMN "updated_by" text;--> statement-breakpoint
UPDATE "agent_skills" SET "updated_at" = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') WHERE "updated_at" = '1970-01-01T00:00:00.000Z';--> statement-breakpoint
CREATE TABLE "agent_skill_autonomy_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"skill_id" text NOT NULL,
	"from_level" integer,
	"to_level" integer NOT NULL,
	"rationale" text,
	"changed_by" text NOT NULL,
	"changed_at" text NOT NULL
);--> statement-breakpoint
ALTER TABLE "agent_skill_autonomy_audit" ADD CONSTRAINT "agent_skill_autonomy_audit_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asaa_agent_idx" ON "agent_skill_autonomy_audit" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "asaa_pair_idx" ON "agent_skill_autonomy_audit" USING btree ("agent_id","skill_id");--> statement-breakpoint
CREATE INDEX "asaa_changed_at_desc_idx" ON "agent_skill_autonomy_audit" USING btree ("changed_at");
