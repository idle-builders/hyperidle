/**
 * A stand-in `openTask` binding for tests that build the tool stack but
 * never exercise a task read.
 *
 * @lore BC3 architecture.md §5 B4: `THROWING_REVIEW_ACCESSOR`/
 * `NO_LINK_REVIEW_ACCESSOR` (the `ToolHandlersReviewAccessor`/`gate` stand-
 * ins) are DELETED with `submit_review` — the port they stood in for no
 * longer exists. `ThreadActionsDeps.linkReviewToSession` (bound to
 * `AgentOrchestrationPort.gate.linkReview`) is the successor, exercised by
 * `layers/core-api/src/__tests__/thread-actions.integration.test.ts`, never
 * by a tool-stack stand-in.
 *
 * It throws rather than doing nothing. A no-op accessor would let a test
 * that DOES care about the task read pass while reading nothing, which is
 * the exact class of silent failure this package's `@lore` convention exists
 * to remove.
 */
import type { ToolHandlersOpenTask } from "../services/tool-handlers-bindings.js";

/**
 * §8 B1 — for `openTask` (`write_memory`/`create_artifact`'s task read). A
 * test about one of those tools' task-reading behaviour injects its own
 * `openTask`.
 */
export const THROWING_OPEN_TASK: ToolHandlersOpenTask = () => {
	throw new Error(
		"THROWING_OPEN_TASK: this test built the tool stack without a real openTask binding, but a handler reached it. Inject a real one for task-reading behaviour.",
	);
};
