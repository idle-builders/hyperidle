-- Action rules table — scoped items that flag agent actions needing
-- human approval. Scope is global, team, or agent; resolution at
-- provisioning is by union. The list starts empty; no action is interrupted
-- until a human adds a rule.

CREATE TABLE "action_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"pattern" text NOT NULL,
	"description" text NOT NULL,
	"scope" text NOT NULL,
	"scope_id" text,
	"created_at" text NOT NULL,
	CONSTRAINT "action_rules_scope_ck" CHECK ("action_rules"."scope" IN ('global', 'team', 'agent')),
	CONSTRAINT "action_rules_scope_id_ck" CHECK (("action_rules"."scope" = 'global' AND "action_rules"."scope_id" IS NULL) OR ("action_rules"."scope" IN ('team', 'agent') AND "action_rules"."scope_id" IS NOT NULL))
);--> statement-breakpoint
CREATE INDEX "action_rules_scope_idx" ON "action_rules" USING btree ("scope","scope_id");
