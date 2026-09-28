-- HARD DELETE the cost
-- feature — no cap gate, no ledger, no display, no DB columns, no
-- replacement mechanism.
--
-- Hand-authored incremental migration (this repo's migrations are additive
-- SQL files tracked only by meta/_journal.json past 0042 — see 0043-0053 —
-- not by a regenerated drizzle-kit snapshot chain; `drizzle-kit generate`
-- against the stale 0042 snapshot re-detects every 0043-0053 change as new,
-- so its output is NOT usable verbatim here — this file contains only the
-- genuinely new DROP COLUMN / CHECK-constraint statements for the cost
-- columns removed from `schema.ts` in this same commit).
--
-- DATA-PRESERVATION NOTE (deliberate, not a regression): every dropped column
-- below is either an unenforced "lightweight cost accounting" value, or a legacy/rollback-only column already superseded by a
-- structured pair dropped in the SAME statement group (e.g. `cost_cap` /
-- `cost_actual` alongside `cost_cap_minor` / `cost_cap_currency`). No
-- replacement column, table, or mechanism is added.

-- users: legacy + structured agent-level cost cap/actual.
ALTER TABLE "users" DROP COLUMN "cost_cap";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "cost_actual";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "cost_cap_minor";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "cost_cap_currency";--> statement-breakpoint

-- team_members: legacy + structured team-level cost cap/actual.
ALTER TABLE "team_members" DROP COLUMN "cost_cap";--> statement-breakpoint
ALTER TABLE "team_members" DROP COLUMN "cost_actual";--> statement-breakpoint
ALTER TABLE "team_members" DROP COLUMN "cost_cap_minor";--> statement-breakpoint
ALTER TABLE "team_members" DROP COLUMN "cost_cap_currency";--> statement-breakpoint

-- tasks: dead legacy cost cap/actual (never written).
ALTER TABLE "tasks" DROP COLUMN "cost_cap";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "cost_actual";--> statement-breakpoint

-- bets: structured cost appetite + accumulated actual cost.
ALTER TABLE "bets" DROP COLUMN "cost_appetite_minor";--> statement-breakpoint
ALTER TABLE "bets" DROP COLUMN "cost_appetite_currency";--> statement-breakpoint
ALTER TABLE "bets" DROP COLUMN "cost_actual_minor";--> statement-breakpoint
ALTER TABLE "bets" DROP COLUMN "cost_actual_currency";--> statement-breakpoint

-- routines: per-run + monthly cost cap, accumulated actual cost.
ALTER TABLE "routines" DROP COLUMN "cost_actual_minor";--> statement-breakpoint
ALTER TABLE "routines" DROP COLUMN "cost_actual_currency";--> statement-breakpoint
ALTER TABLE "routines" DROP COLUMN "cost_cap_per_run_minor";--> statement-breakpoint
ALTER TABLE "routines" DROP COLUMN "cost_cap_monthly_minor";--> statement-breakpoint

-- routine_runs: per-run recorded cost.
ALTER TABLE "routine_runs" DROP COLUMN "cost_minor";--> statement-breakpoint
ALTER TABLE "routine_runs" DROP COLUMN "cost_currency";--> statement-breakpoint

-- agent_session_requests: per-session recorded cost + the unreachable
-- 'cost_cap' termination reason (the cap gate that produced it is deleted).
ALTER TABLE "agent_session_requests" DROP COLUMN "cost_cents";--> statement-breakpoint
ALTER TABLE "agent_session_requests" DROP CONSTRAINT "agent_session_requests_termination_reason_ck";--> statement-breakpoint
ALTER TABLE "agent_session_requests" ADD CONSTRAINT "agent_session_requests_termination_reason_ck" CHECK ("agent_session_requests"."termination_reason" is null or "agent_session_requests"."termination_reason" in ('user_done', 'user_crashed', 'handoff', 'shutdown'));
