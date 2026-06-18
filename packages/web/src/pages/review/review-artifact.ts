import type { ComponentType } from "react";

/**
 * AL2 — Review canvas vocabulary and contracts.
 *
 * These shapes are intentionally separate from the primitive `Artifact` type in
 * `packages/shared/src/types/artifact.ts`. The review experience maps proof
 * families (code, field-change, action, render, metrics, visual, batch) onto
 * dedicated canvases, plus two utility canvases (outcome_summary frame lead and
 * browser_preview escape hatch) approved in AL1.
 */
export type ReviewCanvasKind =
	| "outcome_summary" // frame lead
	| "field_change_set" // record/field change-set
	| "action_operation" // staged action/operation receipt
	| "rendered_in_context" // email/docs render
	| "metrics_moved" // metrics/data-diff
	| "visual_diff" // visual before→after
	| "code_diff" // code diff (must-win)
	| "batch" // batch/per-item container
	| "browser_preview"; // basic browser view

export const REVIEW_CANVAS_KINDS: readonly ReviewCanvasKind[] = [
	"outcome_summary",
	"field_change_set",
	"action_operation",
	"rendered_in_context",
	"metrics_moved",
	"visual_diff",
	"code_diff",
	"batch",
	"browser_preview",
] as const;

export interface ReviewArtifact<TPayload = unknown> {
	readonly id: string;
	readonly tool: string; // e.g. "stripe", "github", "figma"
	readonly app: string; // human app name, e.g. "Stripe"
	readonly sourceHref: string; // deep link back to source record
	readonly title: string; // artifact title
	readonly kind: ReviewCanvasKind;
	readonly payload: TPayload;
}

export interface ReviewCanvasProps<TPayload = unknown> {
	readonly artifact: ReviewArtifact<TPayload>;
}

export type ReviewCanvasComponent<TPayload = unknown> = ComponentType<ReviewCanvasProps<TPayload>>;

/**
 * A review Subject is the top-level thing being approved. AL2 only populates the
 * artifact list; AL3 composition will add intent, rationale, needs-you,
 * verdict, and conversation.
 */
export interface ReviewSubject {
	readonly id: string;
	readonly title: string;
	readonly artifacts: readonly ReviewArtifact[];
}

// Per-family payload shapes. Deep fields are intentionally `unknown` in the red
// phase; each canvas implementation will narrow them as it lands.
export type OutcomeSummaryPayload = unknown;
export type FieldChangeSetPayload = unknown;
export type ActionOperationPayload = unknown;
export type RenderedInContextPayload = unknown;
export type MetricsMovedPayload = unknown;
export type VisualDiffPayload = unknown;
export type CodeDiffPayload = unknown;
export type BatchPayload = unknown;
export type BrowserPreviewPayload = unknown;
