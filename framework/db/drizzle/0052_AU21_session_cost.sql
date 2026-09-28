-- Additive column, no new table.
-- `agent-orchestration`'s own recorded per-session cost (the cap-gate/aggregate
-- columns stay untouched). Hand-authored incremental migration (this repo's migrations are
-- additive SQL files tracked only by meta/_journal.json — see 0043-0051 —
-- not by a regenerated drizzle-kit snapshot chain past 0042).

ALTER TABLE "agent_session_requests" ADD COLUMN "cost_cents" integer;
