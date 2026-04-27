-- L7: Recovery verbs (PostgreSQL parity migration).
-- Mirrors drizzle/0011_l7_recovery.sql.
CREATE TABLE "recovery_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text NOT NULL,
	"verb" text NOT NULL,
	"reason" text NOT NULL,
	"target_kind" text NOT NULL,
	"target_id" text NOT NULL,
	"at" text NOT NULL,
	"outcome" text NOT NULL,
	"meta" text
);--> statement-breakpoint
ALTER TABLE "recovery_audit" ADD CONSTRAINT "recovery_audit_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recovery_audit_actor_idx" ON "recovery_audit" ("actor_id");--> statement-breakpoint
CREATE INDEX "recovery_audit_target_idx" ON "recovery_audit" ("target_kind","target_id");--> statement-breakpoint
CREATE INDEX "recovery_audit_at_desc_idx" ON "recovery_audit" ("at");--> statement-breakpoint
CREATE TABLE "factory_state" (
	"id" text PRIMARY KEY NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"paused_by" text,
	"paused_at" text,
	"paused_reason" text
);
