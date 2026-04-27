-- L4: Verdict undo + audit duality (docs/work-packages/TRACK-L.md L4,
-- .plan-L4.md §3.1).
--
-- Extends `responses` with state-transition fields so every commit AND
-- every undo lives as an append-only row keyed by (item_id, responded_at):
--   transition          enum 'commit' | 'undo' (NOT NULL, default 'commit')
--   prior_decision      verdict before this transition (nullable)
--   undoes_response_id  FK back to the commit being reversed (nullable)
--   undo_window_seconds snapshot of the configured window at commit time
--
-- Adds `items.agent_acted_at` so the undo endpoint can return 409
-- `agent_already_acted` once the agent runtime has consumed the verdict.
-- L4 only reads this column; the writer ships in D-track. See
-- .plan-L4.md §3.1 CONFUSION block for the rationale.
ALTER TABLE `responses` ADD `transition` text DEFAULT 'commit' NOT NULL;--> statement-breakpoint
ALTER TABLE `responses` ADD `prior_decision` text;--> statement-breakpoint
ALTER TABLE `responses` ADD `undoes_response_id` text REFERENCES responses(id) ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE `responses` ADD `undo_window_seconds` integer;--> statement-breakpoint
ALTER TABLE `items` ADD `agent_acted_at` text;
