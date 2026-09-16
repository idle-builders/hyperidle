/**
 * A gate accessor for tests that build the tool stack but never exercise the
 * gate.
 *
 * It throws rather than doing nothing. A no-op accessor would let a test that
 * DOES care about the gate pass while recording nothing, which is the exact
 * class of silent failure BA2 exists to remove — a human sees "approved" and
 * assumes the action happened.
 *
 * A test about the gate injects its own accessor instead.
 */
import type { ToolHandlersReviewAccessor } from "@hyperidle/tool-handlers";
import type { ToolHandlersOpenTask } from "../services/tool-handlers-bindings.js";

export const THROWING_REVIEW_ACCESSOR: ToolHandlersReviewAccessor = {
	linkReviewToSession: () => {
		throw new Error(
			"THROWING_REVIEW_ACCESSOR: this test built the tool stack without a real gate accessor, but a handler reached it. Inject a real one for gate behaviour.",
		);
	},
};

/**
 * §8 B1 — same "throws rather than doing nothing" idiom as
 * {@link THROWING_REVIEW_ACCESSOR}, for `openTask` (`write_memory`/
 * `submit_review`/`create_artifact`'s task read). A test about one of those
 * three tools' task-reading behaviour injects its own `openTask`.
 */
export const THROWING_OPEN_TASK: ToolHandlersOpenTask = () => {
	throw new Error(
		"THROWING_OPEN_TASK: this test built the tool stack without a real openTask binding, but a handler reached it. Inject a real one for task-reading behaviour.",
	);
};

/**
 * For tests that DO run `submit_review`, in a session no rule ever blocked.
 *
 * Recording nothing is the correct behaviour here, not a stub: a review filed
 * by an unblocked agent is an ordinary review and must not become a clearance.
 * A test about a blocked session injects an accessor that records instead.
 */
export const NO_LINK_REVIEW_ACCESSOR: ToolHandlersReviewAccessor = {
	linkReviewToSession: async () => {},
};
