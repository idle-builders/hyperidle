/**
 * @lore queueDeps: drainIntents/reapExpired accept {db, eventBus?} minimal shape; call sites compile without constructing a full DurableAgentQueueDeps
 */

import type { HyperIdleDb } from "@hyperidle/db";

export function queueDeps(db: HyperIdleDb) {
	return { db };
}
