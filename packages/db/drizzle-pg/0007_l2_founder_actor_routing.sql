-- L2: Founder/actor routing — Postgres dialect. The two well-known
-- actor rows (`actor:ceo`, `actor:cpo`) are inserted by `seed-pg.ts`
-- (idempotent via `onConflictDoNothing`); they are not seeded by this
-- migration.
CREATE TABLE "actors" (
	"id" text PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"domain_tags" text DEFAULT '[]' NOT NULL,
	"created_at" text NOT NULL
);--> statement-breakpoint
ALTER TABLE "threads" ADD COLUMN "routed_to_actor_id" text;--> statement-breakpoint
ALTER TABLE "threads" ADD COLUMN "domain_tag" text;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_routed_to_actor_id_actors_id_fk" FOREIGN KEY ("routed_to_actor_id") REFERENCES "public"."actors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE TABLE "thread_routing_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"from_actor_id" text,
	"to_actor_id" text,
	"reason" text NOT NULL,
	"changed_by" text NOT NULL,
	"at" text NOT NULL
);--> statement-breakpoint
ALTER TABLE "thread_routing_audit" ADD CONSTRAINT "thread_routing_audit_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_routing_audit" ADD CONSTRAINT "thread_routing_audit_from_actor_id_actors_id_fk" FOREIGN KEY ("from_actor_id") REFERENCES "public"."actors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_routing_audit" ADD CONSTRAINT "thread_routing_audit_to_actor_id_actors_id_fk" FOREIGN KEY ("to_actor_id") REFERENCES "public"."actors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tra_thread_idx" ON "thread_routing_audit" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "tra_at_idx" ON "thread_routing_audit" USING btree ("at");
