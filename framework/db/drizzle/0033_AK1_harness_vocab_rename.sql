-- Harness-vocabulary rename rollout — column renames (forward-only).
-- Renames: soul_prompt → system_prompt, soul_prompt_path → system_prompt_path,
--          workspace_snapshot → sandbox_snapshot.
-- All RENAME COLUMN operations are safe (data-preserving, supported by PostgreSQL ≥9.x).
-- No down-migration: data is preserved in the renamed column; behaviour-neutral.
ALTER TABLE "users" RENAME COLUMN "soul_prompt" TO "system_prompt";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "soul_prompt_path" TO "system_prompt_path";--> statement-breakpoint
ALTER TABLE "sessions" RENAME COLUMN "workspace_snapshot" TO "sandbox_snapshot";
