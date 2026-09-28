import type { AnchorRef, VerdictDecision } from "@hyperidle/domain-model";
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

export interface ComposedReviewArtifact extends ReviewArtifact {
	/** Optional one-line summary shown in the artifact opener row. */
	readonly summary?: string;
	/** Optional badge shown at the right of the opener row. */
	readonly badge?: string;
}

/**
 * A full review Subject as seen on the composition surface.
 * Extends the artifact-only Subject with the frame metadata the
 * reviewer needs to orient, judge, and decide without opening anything.
 */
export interface ComposedReviewSubject extends ReviewSubject {
	/**
	 * The review message's own thread id, always composed by the loader
	 * (never read from the payload). The page fetches this thread directly
	 * instead of guessing it from a host lookup, which resolves the WRONG
	 * thread whenever a host has more than one.
	 */
	readonly threadId: string;
	readonly parentTaskId: string | null;
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
	readonly presentation?: "page" | "pane";
}
