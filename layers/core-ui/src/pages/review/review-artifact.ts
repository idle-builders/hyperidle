import type { ComponentType } from "react";

/**
 * AL2 — Review canvas vocabulary and contracts.
 *
 * These shapes are intentionally separate from the primitive `Artifact` type in
 * `framework/domain-model/src/types/artifact.ts`. The review experience maps proof
 * families (code, field-change, action, render, metrics, visual, batch) onto
 * dedicated canvases, plus two utility canvases (outcome_summary frame lead and
 * browser_preview escape hatch) approved in AL1.
 *
 * @lore this nine-value list is byte-identical to `REVIEW_CANVAS_KINDS`
 * (`framework/domain-model/src/thread.ts`), the single-homed copy
 * `@hyperidle/tool-handlers`'s `submit_review` and `threads-schema.ts`'s
 * write arm both validate `artifacts[].kind` against. Deliberately left
 * un-unified with this copy — core-ui cannot be a dependency of
 * `agent-orchestration`/`core-api` (layer boundary), so the two lists are
 * kept in sync by hand. Change one, change both.
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

// Per-family payload shapes, aligned with the fixtures in
// `review-subject.fixture.ts`. Canvases may enrich these locally when building
// their internal view models; these types are the canonical AL2 shape.

export interface OutcomeSummaryPayload {
	readonly agentName: string;
	readonly agentInitials: string;
	readonly reviewerName: string;
	readonly achieved: string;
	readonly tools: readonly string[];
	readonly tokens: number;
	readonly standing: "Awaiting" | "Blocking";
	readonly doneConditions: readonly {
		readonly label: string;
		readonly met: boolean;
		readonly note?: string;
		readonly jumpLabel: string;
	}[];
	readonly needsYou: readonly {
		readonly category: string;
		readonly severity: "error" | "warning";
		readonly detail: string;
		readonly jumpLabel: string;
	}[];
}

export interface FieldChangeSetPayload {
	readonly recordLabel: string;
	readonly fields: readonly {
		readonly label: string;
		readonly old: string | null;
		readonly new: string;
		readonly provenance?: string;
		readonly needsYou?: string;
	}[];
	readonly unchangedCount: number;
}

export interface ActionOperationPayload {
	readonly verb: string;
	readonly amountWire: {
		readonly currency: string;
		readonly units: number;
		readonly formatted: string;
	};
	readonly irreversible: boolean;
	readonly reversible: boolean;
	readonly blastRadius: readonly string[];
	readonly receiptFields: readonly {
		readonly label: string;
		readonly value: string;
	}[];
}

export interface RenderedInContextPayload {
	readonly inboxRow: {
		readonly sender: string;
		readonly subject: string;
		readonly preview: string;
	};
	readonly body: string;
	readonly renderMode: string;
	readonly flags: readonly string[];
}

export interface MetricsMovedPayload {
	readonly period: string;
	readonly headlines: readonly {
		readonly label: string;
		readonly prior: number;
		readonly current: number;
	}[];
	readonly rows: readonly unknown[];
	readonly tieOut: {
		readonly opening: number;
		readonly activity: number;
		readonly closing: number;
		readonly ties: boolean;
	};
	readonly exceptions: readonly {
		readonly amount: number;
		readonly title: string;
		readonly detail: string;
		readonly needsYou?: boolean;
	}[];
}

export interface VisualDiffPayload {
	readonly before: { readonly label: string };
	readonly after: { readonly label: string };
	readonly diffRegions: readonly {
		readonly id: string;
		readonly label: string;
	}[];
	readonly overlayMode: string;
}

export type CodeDiffLineKind = "add" | "del" | "ctx";

export interface CodeDiffLine {
	readonly kind: CodeDiffLineKind;
	readonly oldNo: number | null;
	readonly newNo: number | null;
	readonly text: string;
}

export interface CodeDiffHunk {
	readonly header: string;
	readonly lines: readonly CodeDiffLine[];
}

export interface CodeDiffPayload {
	readonly prTitle: string;
	readonly description: string;
	readonly checks: readonly string[];
	readonly files: readonly {
		readonly path: string;
		readonly band: "logic" | "test" | "trivia";
		readonly rationale?: string;
		readonly added?: number;
		readonly removed?: number;
		readonly hunks?: readonly CodeDiffHunk[];
	}[];
	readonly triviaSummary: string;
	readonly trivia?: {
		readonly count: number;
		readonly summary: string;
		readonly added: number;
		readonly removed: number;
	};
}

export interface BatchPayload {
	readonly rollup: {
		readonly total: number;
		readonly needYou: number;
		readonly autoResolved: number;
		readonly drafted: number;
	};
	readonly flagged: readonly {
		readonly id: string;
		readonly ref: string;
		readonly reason: string;
	}[];
	readonly auto: readonly {
		readonly id: string;
		readonly label: string;
		readonly count: number;
	}[];
	readonly drafted: readonly {
		readonly id: string;
		readonly label: string;
		readonly count: number;
	}[];
	readonly approveAllExcept: readonly string[];
}

export interface BrowserPreviewPayload {
	readonly url: string;
	readonly title: string;
	readonly previewBody: string;
}
