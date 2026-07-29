-- AU21 §9 Increment 6 (Decision D) — additive column, no new table.
-- `agent-orchestration`'s own recorded per-session cost, closing the gap
-- architecture.md §6 Decision D traces: there is no cost "mirror" to delete
-- (the cap-gate/aggregate columns stay untouched); per-session cost has never
-- been persisted anywhere (`@lore O2` stripped the old `sessions` cost
-- columns). Hand-authored incremental migration (this repo's migrations are
-- additive SQL files tracked only by meta/_journal.json — see 0043-0051 —
-- not by a regenerated drizzle-kit snapshot chain past 0042).

ALTER TABLE "agent_session_requests" ADD COLUMN "cost_cents" integer;
