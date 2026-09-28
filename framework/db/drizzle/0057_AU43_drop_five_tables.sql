-- Drop five tables that have no production readers or writers.
--
-- Hand-authored incremental migration (migrations past 0042 are additive SQL
-- files tracked only by meta/_journal.json — drizzle-kit generate against the
-- stale 0042 snapshot is NOT usable verbatim here).
--
-- WHY each table is dropped:
--
-- agent_lifecycle_inbox: the no-op projector outbox. Its write path was removed;
--   no production inserter or reader ever
--   landed. The `agentLifecycleInbox` symbol was referenced only in a comment in
--   service-bootstrap.ts.
--
-- trigger_resolution_history: never had a production inserter. Added in 0045 for
--   the trigger resolution path; that path was never completed. Zero write or
--   read sites in production.
--
-- filesystem_captures: write-only archive whose consumer was cancelled.
--   Capture write code removed in stage 2; no non-test reader has ever existed.
--   Referenced only in comments in mounter-registry.ts and index.ts.
--
-- task_planning_signals: `task_strategy_fabric` renamed in migration 0050.
--   Never had a production writer after the riskTier column it stored was
--   dropped. Referenced only in comments in work/src/index.ts and
--   review/src/index.ts.
--
-- team_run_config_defaults: the one-reader memo. The single reader
--   (`readTeamRunConfigDefaults` in agent-run-config) was removed in stage 2.
--   Referenced only in a comment in team-lookup.ts.
--
-- FOREIGN KEY ORDER: each dropped table holds outbound FKs only — no surviving
-- table references any of these five as a FK target. Postgres drops outbound FK
-- constraints along with the table, so order here is arbitrary.

DROP TABLE "agent_lifecycle_inbox";--> statement-breakpoint
DROP TABLE "trigger_resolution_history";--> statement-breakpoint
DROP TABLE "filesystem_captures";--> statement-breakpoint
DROP TABLE "task_planning_signals";--> statement-breakpoint
DROP TABLE "team_run_config_defaults";
