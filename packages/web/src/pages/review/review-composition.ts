import type { VerdictDecision } from "@hyperidle/shared";
import type { ReviewArtifact, ReviewSubject } from "./review-artifact.js";

export interface ReviewCommentRef {
	readonly kind: "artifact" | "line";
	readonly label: string;
}

export interface ReviewComment {
	readonly id: string;
	readonly author: string;
	readonly authorIsAgent: boolean;
	readonly body: string;
	readonly ago: string;
	readonly refs?: ReadonlyArray<ReviewCommentRef>;
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
	readonly costMoney: string;
	readonly costTokens: string;
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
	readonly initialOpenArtifactId?: string | null;
	readonly resolved?: boolean;
}
