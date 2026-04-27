-- L9: Artifact-Kind Renderers (docs/work-packages/TRACK-L.md L9,
-- .plan-L9.md §3.1).
--
-- Adds two new optional columns to `items` to back the L9 metadata strip:
--   * `reversibility`  — integer 0/1, nullable. Producer/founder predicate
--                         driving the L4 rollback verb and L7 kill switch.
--   * `sandbox_result` — text, nullable. Producer-supplied 'passed' | 'failed'
--                         | 'n/a' from the H-track sandbox runner.
--
-- `blast_radius` continues to live inside `items.attachments` JSON under
-- the `blast_radius` key (see shared `BlastRadius` type) — no schema change
-- needed for that field.
--
-- `risk_tier` is widened in TypeScript only ('low' | 'medium' | 'high' |
-- 'critical'); the column is plain text with no CHECK constraint.
ALTER TABLE `items` ADD `reversibility` integer;--> statement-breakpoint
ALTER TABLE `items` ADD `sandbox_result` text;
