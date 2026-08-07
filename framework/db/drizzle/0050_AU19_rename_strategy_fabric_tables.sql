-- AU19 Increment 1k: finish AU3's half-done Strategy-vocabulary rename.
--
-- Hand-authored incremental migration (this repo's migrations are additive
-- SQL files tracked only by meta/_journal.json — see 0043-0049 — not by a
-- regenerated drizzle-kit snapshot chain past 0042).
--
-- AU3 (the Kernel/Strategy runtime retirement) was supposed to rename the
-- `knowledge_strategy_fabric`/`task_strategy_fabric` extension tables to the
-- app-owned vocabulary but only bolted a JS alias export onto the unchanged
-- physical tables, leaving TS code and SQL disagreeing on the table's name
-- forever. This repo is pre-launch (boil-the-lake, ETHOS.md) — a real,
-- non-destructive rename is cheap and removes the confusion permanently.
--
-- Non-destructive: ALTER TABLE ... RENAME TO preserves all data, columns,
-- indexes, foreign keys, and unique constraints unchanged (PostgreSQL does
-- not require constraint/index names to match their table's name after a
-- rename — mirrors the 0033_AK1_harness_vocab_rename.sql rename-only
-- precedent, which also left constraint names untouched after a rename).
ALTER TABLE "knowledge_strategy_fabric" RENAME TO "knowledge_app_projection";--> statement-breakpoint
ALTER TABLE "task_strategy_fabric" RENAME TO "task_planning_signals";
