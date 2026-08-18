/**
 * @lore AU43: `DurableAgentQueueDeps` and the lifecycle-projection subsystem
 * were removed. `drainIntents` / `reapExpired` now accept `{ db, eventBus? }`.
 * This helper returns exactly that minimal shape so all consumers compile
 * unchanged after the refactor.
 */

import type { HyperIdleDb } from "@hyperidle/db";

export function queueDeps(db: HyperIdleDb) {
	return { db };
}
