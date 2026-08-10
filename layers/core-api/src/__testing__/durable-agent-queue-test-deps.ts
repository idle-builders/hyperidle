/**
 * @lore AU31 B2 (§5, §12 lifecycle-drain cluster): `queueDeps`'s production
 * home relocated into `@hyperidle/agent-orchestration` (boot-internal to
 * `bootAgentOrchestration` now, not a face export a cross-layer file could
 * reach — `layer-exports-resolve-inside-the-layer`/R2, §7). These dev-only
 * suites need the same `DurableAgentQueueDeps` shape purely to drive
 * `drainIntents`/`startLifecycleProjectionDrain`/`reapExpired` directly in a
 * test, so this helper rebuilds it from `@hyperidle/session-requests`'s own
 * public `transitionSessionRequest` — the SAME wiring the production
 * composition root uses (`agent-orchestration/src/services/
 * durable-agent-queue.ts`), not a fake or a stub.
 */

import type { HyperIdleDb, WriteExecutor } from "@hyperidle/db";
import { type DurableAgentQueueDeps, transitionSessionRequest } from "@hyperidle/session-requests";

const ports = {
	lifecycleProjection: {
		explicitSessionStarts: {
			projectTerminalState: async (
				exec: WriteExecutor,
				requestId: string,
				patch: {
					readonly status: "completed" | "failed" | "cancelled";
					readonly sessionId: string | null;
					readonly failureCode: string | null;
				},
			) => {
				await transitionSessionRequest(exec, {
					target: "explicitStart",
					transaction: "existing",
					requestId,
					to: patch.status,
					sessionId: patch.sessionId,
					failureCode: patch.failureCode,
				});
			},
		},
	},
};

export function queueDeps(db: HyperIdleDb): DurableAgentQueueDeps {
	return { db, ...ports };
}
