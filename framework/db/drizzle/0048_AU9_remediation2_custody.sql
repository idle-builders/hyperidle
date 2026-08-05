-- AU9 Remediation-2: enumerated durable-rows checks (architecture.md
-- "Durable-rows checks (enumerated)"). Hand-authored incremental migration
-- (this repo's migrations are additive SQL files tracked only by
-- meta/_journal.json — see 0043-0047 — not by a regenerated drizzle-kit
-- snapshot chain past 0042).

-- 1/2/3: kind is exactly the seven values (no legacy 'assistant'/'task_dispatch');
-- source_kind is exactly the seven values (no legacy 'assistant'); kind/source
-- compatibility is a closed pairing map.
ALTER TABLE "agent_work_intents" DROP CONSTRAINT "agent_work_intents_kind_ck";
--> statement-breakpoint
ALTER TABLE "agent_work_intents" ADD CONSTRAINT "agent_work_intents_kind_ck" CHECK ("kind" IN ('assistant_turn','session_start','knowledge_action','routine_run','bet_decomposition','task_run','reengagement'));
--> statement-breakpoint
ALTER TABLE "agent_work_intents" DROP CONSTRAINT "agent_work_intents_source_kind_ck";
--> statement-breakpoint
ALTER TABLE "agent_work_intents" ADD CONSTRAINT "agent_work_intents_source_kind_ck" CHECK ("source_kind" IN ('thread_message','explicit_session_start','knowledge_action','routine_run','bet','task_dispatch_attempt','proposed_call'));
--> statement-breakpoint
ALTER TABLE "agent_work_intents" ADD CONSTRAINT "agent_work_intents_kind_source_compat_ck" CHECK (
	("kind" = 'assistant_turn' AND "source_kind" = 'thread_message')
	OR ("kind" = 'session_start' AND "source_kind" = 'explicit_session_start')
	OR ("kind" = 'knowledge_action' AND "source_kind" = 'knowledge_action')
	OR ("kind" = 'routine_run' AND "source_kind" = 'routine_run')
	OR ("kind" = 'bet_decomposition' AND "source_kind" = 'bet')
	OR ("kind" = 'task_run' AND "source_kind" = 'task_dispatch_attempt')
	OR ("kind" = 'reengagement' AND "source_kind" = 'proposed_call')
);
--> statement-breakpoint

-- 4/5/6/7: one consolidated per-status correlation check — pending forbids
-- claim/correlation fields; claimed requires token+expiry and forbids request
-- correlation; handed_off requires request_id; failed requires a stable
-- last_error_code.
ALTER TABLE "agent_work_intents" DROP CONSTRAINT "agent_work_intents_correlation_ck";
--> statement-breakpoint
ALTER TABLE "agent_work_intents" ADD CONSTRAINT "agent_work_intents_correlation_ck" CHECK (
	("status" = 'pending' AND "claim_token" IS NULL AND "claim_expires_at" IS NULL AND "request_id" IS NULL)
	OR ("status" = 'claimed' AND "claim_token" IS NOT NULL AND "claim_expires_at" IS NOT NULL AND "request_id" IS NULL)
	OR ("status" = 'handed_off' AND "request_id" IS NOT NULL)
	OR ("status" = 'failed' AND "last_error_code" IS NOT NULL)
);
--> statement-breakpoint

-- 8/9: unique non-null request_id; request_id FK ON DELETE RESTRICT (was a
-- plain REFERENCES with the default NO ACTION, Postgres-assigned name
-- agent_work_intents_request_id_fkey).
CREATE UNIQUE INDEX "agent_work_intents_request_id_uq" ON "agent_work_intents" ("request_id") WHERE "request_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_work_intents" DROP CONSTRAINT "agent_work_intents_request_id_fkey";
--> statement-breakpoint
ALTER TABLE "agent_work_intents" ADD CONSTRAINT "agent_work_intents_request_id_agent_session_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "agent_session_requests"("id") ON DELETE RESTRICT;
--> statement-breakpoint

-- 10: unique (kind, source_kind, source_id, idempotency_key) — the existing
-- identity index was missing source_kind.
DROP INDEX "agent_work_intents_identity_uq";
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_work_intents_identity_uq" ON "agent_work_intents" ("kind", "source_kind", "source_id", "idempotency_key");
--> statement-breakpoint

-- agent_session_requests: running requires session_id; claimed requires
-- claim_token+claim_expires_at; closed statuses forbid a live claim;
-- termination_reason in the five values or NULL.
ALTER TABLE "agent_session_requests" DROP CONSTRAINT "agent_session_requests_correlation_ck";
--> statement-breakpoint
ALTER TABLE "agent_session_requests" ADD CONSTRAINT "agent_session_requests_correlation_ck" CHECK (
	("status" = 'running' AND "session_id" IS NOT NULL)
	OR ("status" = 'claimed' AND "claim_token" IS NOT NULL AND "claim_expires_at" IS NOT NULL)
	OR ("status" = 'pending')
	OR ("status" IN ('completed', 'failed', 'cancelled') AND "claim_token" IS NULL AND "claim_expires_at" IS NULL)
);
--> statement-breakpoint
ALTER TABLE "agent_session_requests" ADD CONSTRAINT "agent_session_requests_termination_reason_ck" CHECK ("termination_reason" IS NULL OR "termination_reason" IN ('user_done', 'user_crashed', 'handoff', 'cost_cap', 'shutdown'));
