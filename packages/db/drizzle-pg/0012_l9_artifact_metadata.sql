-- L9: Artifact-Kind Renderers — Postgres dialect.
--
-- Adds two new optional columns to `items` to back the L9 metadata strip:
--   * `reversibility`  — boolean, nullable. Mirrors `blocking` boolean type.
--   * `sandbox_result` — text, nullable. 'passed' | 'failed' | 'n/a'.
--
-- `blast_radius` continues to live inside `items.attachments` JSON under
-- the `blast_radius` key — no schema change for that field.
--
-- `risk_tier` is widened in TypeScript only; the column is plain text with
-- no CHECK constraint.
ALTER TABLE "items" ADD COLUMN "reversibility" boolean;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "sandbox_result" text;
