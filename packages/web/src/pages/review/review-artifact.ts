// AL5 A3: ReviewCanvasKind moved to @hyperidle/shared so shared can reference
// it without importing from web. Re-exported here for backward compat — all
// existing web-internal imports remain valid.
import type { ReviewCanvasKind } from "@hyperidle/shared";
import type { ComponentType } from "react";

export type { ReviewCanvasKind } from "@hyperidle/shared";
export { REVIEW_CANVAS_KINDS } from "@hyperidle/shared";

import type { CanvasSlots } from "./surface-slots.js";

// @lore AL5 A3: ReviewCanvasKind is now sourced from @hyperidle/shared (review-surface.ts).
// This file re-exports it for backward compat. The type is identical — 9 string literals,
// same names. No behavior change for existing canvases.

/**
 * AL2 — Review canvas vocabulary and contracts.
 *
 * These shapes are intentionally separate from the primitive `Artifact` type in
 * `packages/shared/src/types/artifact.ts`. The review experience maps proof
 * families (code, field-change, action, render, metrics, visual, batch) onto
 * dedicated canvases, plus two utility canvases (outcome_summary frame lead and
 * browser_preview escape hatch) approved in AL1.
 */

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
	/** AL5: optional slot overrides — undefined => base canvas renders its defaults. Additive/opt-in. */
	readonly slots?: CanvasSlots;
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
	readonly costUsd: number;
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
