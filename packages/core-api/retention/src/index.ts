/**
 * Barrel for @hyperidle/retention (core-api Layer, non-SQL orchestration
 * Service).
 *
 * Typed functions only. `retention` owns ZERO tables — the 5 tables its
 * TTL sweep prunes are owned by other Services (`login_sessions`/
 * `invite_codes` → `users`, `knowledge_access_log` → `knowledge`,
 * `notification_queue` → `notifications`) except `propagation_log`, which
 * is genuinely unowned (`UNOWNED_SHARED_TABLES`) and stays a direct
 * `@hyperidle/db` access — same shape as `policy`'s Increment 2a /
 * `git-export`'s Increment 2c / `observability`'s Increment 2d /
 * `model-gateway`'s Increment 2e / `realtime`'s Increment 2f zero-table
 * findings. No `TABLE_OWNER` row is added.
 *
 * Architecture §9 point 5's fold decision ("Keep it a Service; revisit
 * folding into `dispatch` only if it shrinks to a single call") resolves to
 * keeping `retention` a Service — even after every per-table delete became
 * an injected port (Mechanism A forced this), it still coordinates 3
 * distinct owning-Service ports + one direct unowned-table sweep, not a
 * single delegate call.
 *
 * @lore AU19 Increment 2g: this is the real cut-over — `retention-reaper.ts`
 * (`reapRetentionOnce`/`startRetentionReaper`) moved here from
 * `packages/server/src/services/retention-reaper.ts` (behavior-preserving
 * move, aside from the DI-port signature change documented in
 * `retention-reaper.ts`'s and `ports.ts`'s top comments). This closes
 * Increment 2 (core-api non-SQL Services) — `policy`, `git-export`,
 * `observability`, `model-gateway`, `filesystems`, `realtime`, `retention`
 * are all real migrated packages now.
 */

export type {
	RetentionKnowledgeAccessLogReaper,
	RetentionNotificationQueueReaper,
	RetentionReaperDeps,
	RetentionUsersReaper,
} from "./ports.js";
export type { RetentionReaperOptions, RetentionSweepResult } from "./retention-reaper.js";
export {
	CONSUMED_INVITE_TTL_MS,
	RETENTION_REAPER_INTERVAL_MS,
	reapRetentionOnce,
	startRetentionReaper,
	TERMINAL_LOG_TTL_MS,
} from "./retention-reaper.js";
