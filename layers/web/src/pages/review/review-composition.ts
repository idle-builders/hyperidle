import type { AnchorRef, ProposedCallStatus, VerdictDecision } from "@hyperidle/shared";
import type { ReviewArtifact, ReviewSubject } from "./review-artifact.js";

export interface ReviewCommentRef {
	readonly kind: "artifact" | "block";
	readonly label: string;
	readonly artifactId?: string;
	readonly blockId?: string;
	readonly spotLabel?: string;
}

export interface ReviewComment {
	readonly id: string;
	readonly author: string;
	readonly authorIsAgent: boolean;
	readonly body: string;
	readonly ago: string;
	readonly refs?: ReadonlyArray<ReviewCommentRef>;
	readonly anchor?: AnchorRef;
}

export interface ReviewKpi {
	readonly label: string;
	readonly value: string;
	readonly delta?: string;
	readonly good?: boolean;
}

export interface ReviewNeed {
	readonly id: string;
	readonly kind: "blast-radius" | "over-authority" | "unhandled-exception" | "unverified-claim";
	readonly label: string;
	readonly detail: string;
	readonly artifactId?: string;
}

export interface ReviewIntentCondition {
	readonly text: string;
	readonly met: boolean;
}

export interface ReviewVerdictState {
	readonly decision?: VerdictDecision;
	readonly note?: string;
	readonly resolvedAt?: string;
}

/**
 * AL7 trust-first: the execution outcome returned by the reviews loader.
 * The component never parses time — `executedAt` is pre-humanized by the loader.
 */
export interface ProposedCallOutcomeView {
	readonly status: "ok" | "failed";
	/** The tool's return identity that proves it happened (e.g. `re_3Qs… · refunded`). */
	readonly receipt?: string;
	/** Surfaced verbatim + un-truncated on failure — never swallowed, never clipped. */
	readonly error?: string;
	/** Already-formatted short/relative display string (e.g. "2 min ago"). */
	readonly executedAt: string;
}

/**
 * AL7 trust-first: the Proposed Call + outcome data returned by the reviews loader for
 * an operative artifact (`action_operation` kind).
 * WARNING-2: args is the verbatim captured args object (not an argsSummary string).
 */
export interface ProposedCallView {
	readonly proposedCallId: string;
	readonly toolId: string;
	readonly args: Record<string, unknown>; // verbatim captured args (AC10b)
	readonly status: ProposedCallStatus;
	readonly outcome?: ProposedCallOutcomeView;
}

// @lore AL7: StagedOperationView/StagedOperationOutcomeView retained as aliases
// during the green phase to avoid a full web component rewrite in one PR.
// ReviewComposition.tsx reads artifact.proposedCall?.{} directly.
/** @deprecated Use ProposedCallOutcomeView */
export type StagedOperationOutcomeView = ProposedCallOutcomeView;
/** @deprecated Use ProposedCallView */
export type StagedOperationView = ProposedCallView;

export interface ComposedReviewArtifact extends ReviewArtifact {
	/** Optional one-line summary shown in the artifact opener row. */
	readonly summary?: string;
	/** Optional badge shown at the right of the opener row. */
	readonly badge?: string;
	/**
	 * AL7 trust-first: present only for `action_operation` kind artifacts that have a
	 * Proposed Call row. Undefined for descriptive artifacts (code_diff, field_change_set, etc.)
	 * and for operative artifacts that have not yet been captured.
	 * WARNING-2: args is the verbatim captured args (human approves what they actually see).
	 */
	readonly proposedCall?: ProposedCallView;
	/** @deprecated Use proposedCall — retained for backward compat during web migration. */
	readonly stagedOperation?: StagedOperationView;
}

/**
 * AL3 — a full review Subject as seen on the composition surface.
 * Extends the AL2 artifact-only Subject with the frame metadata the
 * reviewer needs to orient, judge, and decide without opening anything.
 */
export interface ComposedReviewSubject extends ReviewSubject {
	readonly betId: string;
	readonly betTitle: string;
	readonly taskId?: string;
	readonly taskTitle?: string;
	readonly prompt: string;
	readonly authorName: string;
	readonly reviewerName: string;
	readonly blocking: boolean;
	readonly producedAgo: string;
	readonly tokens: string;
	readonly tools: ReadonlyArray<string>;
	readonly outcome: string;
	readonly resultKpis: ReadonlyArray<ReviewKpi>;
	readonly intent: ReadonlyArray<ReviewIntentCondition>;
	readonly needs: ReadonlyArray<ReviewNeed>;
	readonly conversation: ReadonlyArray<ReviewComment>;
	readonly verdict?: ReviewVerdictState;
	readonly artifacts: ReadonlyArray<ComposedReviewArtifact>;
}

export interface ReviewCompositionProps {
	readonly subject: ComposedReviewSubject;
	readonly onSubmitVerdict: (decision: VerdictDecision, note?: string) => void | Promise<void>;
	readonly onOpenSourceLink?: (href: string) => void;
	readonly onPostComment?: (input: { text: string; anchor?: AnchorRef }) => Promise<void>;
	readonly threadId?: string;
	readonly initialOpenArtifactId?: string | null;
	readonly resolved?: boolean;
}
