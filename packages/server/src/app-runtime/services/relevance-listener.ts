import type { HyperIdleDb } from "@hyperidle/db";
import { createLogger, type EventBus } from "@hyperidle/shared";
import { createRelevanceService } from "./relevance-service.js";

const listenerLog = createLogger({ pkg: "fabric" });

/**
 * Subscribe to `knowledge_accessed` events and recompute the relevance score
 * for the accessed item. Returns an unsubscribe function for teardown.
 *
 * Handler is async fire-and-forget: `EventBus.emit` is synchronous over
 * handler invocation but the recompute is async. The wrapper never throws
 * into the bus — errors are logged.
 *
 * @lore AF9: relevance recompute is driven by `knowledge_accessed`, which the
 * route emits AFTER the access-log INSERT. The sync bus guarantees the fresh
 * row is visible to `recomputeScores` when the async handler executes.
 *
 * @lore AF9 CRITIQUE WARNING 1: Do NOT assert the score synchronously after a
 * GET in tests. Use `vi.waitFor` — the handler fires asynchronously after the
 * event invocation returns. See af9-relevance-subscriber.integration.test.ts.
 *
 * @lore AF9 CRITIQUE SUGGESTION: viewing an item via GET /api/knowledge/:id
 * now materialises a `knowledgeAppProjection` row as a side effect of the
 * live read path — `recomputeScores` upserts a minimal fabric row when none
 * exists. This is existing `recomputeScores` behaviour, but AF9 is the first
 * thing that triggers it on the live read path (not just in tests).
 */
export function registerRelevanceListener(db: HyperIdleDb, eventBus: EventBus): () => void {
	// Build the service once at register time (closure) — not per event.
	const relevanceService = createRelevanceService(db);

	const handler = (event: { itemId: string }): void => {
		void (async () => {
			try {
				await relevanceService.recomputeScores([event.itemId]);
			} catch (err) {
				listenerLog.error("relevance recompute failed on knowledge_accessed", {
					itemId: event.itemId,
					err,
				});
			}
		})();
	};

	return eventBus.on("knowledge_accessed", handler);
}
