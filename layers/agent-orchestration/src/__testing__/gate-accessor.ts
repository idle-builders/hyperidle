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
import type { ToolHandlersGateAccessor } from "@hyperidle/tool-handlers";

export const THROWING_GATE_ACCESSOR: ToolHandlersGateAccessor = {
	linkReviewToPendingDenial: () => {
		throw new Error(
			"THROWING_GATE_ACCESSOR: this test built the tool stack without a real gate accessor, but a handler reached it. Inject a real one for gate behaviour.",
		);
	},
};

/**
 * For tests that DO run `submit_review`, in a session no rule ever blocked.
 *
 * Recording nothing is the correct behaviour here, not a stub: a review filed
 * by an unblocked agent is an ordinary review and must not become a clearance.
 * A test about a blocked session injects an accessor that records instead.
 */
export const UNGATED_GATE_ACCESSOR: ToolHandlersGateAccessor = {
	linkReviewToPendingDenial: async () => {},
};
