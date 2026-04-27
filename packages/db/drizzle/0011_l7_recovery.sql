-- L7: Recovery verbs (docs/work-packages/TRACK-L.md L7,
-- .worktrees/L7/.pipeline-plan.md §3).
--
-- Adds:
--   - `recovery_audit` (append-only) — one row per kill / resume /
--     rollback / session-pause / session-resume action. Identity is
--     server-derived from `X-Actor-Id` (mirrors L4 audit attribution).
--   - `factory_state` — singleton row keyed by `id='factory'` recording
--     the current pause state (paused, paused_by, paused_at,
--     paused_reason). The PRIMARY KEY enforces the singleton invariant.
--
-- Mirrors the L1 (`agent_skill_autonomy_audit`) and L2
-- (`thread_routing_audit`) append-only audit shapes; readers MUST never
-- UPDATE/DELETE recovery_audit rows.
CREATE TABLE `recovery_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`verb` text NOT NULL,
	`reason` text NOT NULL,
	`target_kind` text NOT NULL,
	`target_id` text NOT NULL,
	`at` text NOT NULL,
	`outcome` text NOT NULL,
	`meta` text,
	FOREIGN KEY (`actor_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE restrict
);--> statement-breakpoint
CREATE INDEX `recovery_audit_actor_idx` ON `recovery_audit` (`actor_id`);--> statement-breakpoint
CREATE INDEX `recovery_audit_target_idx` ON `recovery_audit` (`target_kind`,`target_id`);--> statement-breakpoint
CREATE INDEX `recovery_audit_at_desc_idx` ON `recovery_audit` (`at`);--> statement-breakpoint
CREATE TABLE `factory_state` (
	`id` text PRIMARY KEY NOT NULL,
	`paused` integer DEFAULT 0 NOT NULL,
	`paused_by` text,
	`paused_at` text,
	`paused_reason` text
);
