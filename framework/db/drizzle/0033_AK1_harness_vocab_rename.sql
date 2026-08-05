-- AK1: Harness-vocabulary rename rollout — column renames (forward-only).
-- Renames: soul_prompt → system_prompt, soul_prompt_path → system_prompt_path,
--          workspace_snapshot → sandbox_snapshot.
-- All RENAME COLUMN operations are safe (data-preserving, supported by PostgreSQL ≥9.x).
-- No down-migration: data is preserved in the renamed column; behaviour-neutral.
-- @lore AK1: These are the only DB changes in AK1. All three renames are additive renames
-- (no type change, no constraint change). The column content is untouched.
ALTER TABLE "users" RENAME COLUMN "soul_prompt" TO "system_prompt";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "soul_prompt_path" TO "system_prompt_path";--> statement-breakpoint
ALTER TABLE "sessions" RENAME COLUMN "workspace_snapshot" TO "sandbox_snapshot";
