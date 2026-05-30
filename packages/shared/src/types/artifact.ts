// L3 — Artifact primitive type definitions.
// Source: plans/L3/architecture.md §3.
// L17 — ArtifactCostFromSession updated to use WireMoney + TokenUsage.

import type { TokenUsage, WireMoney } from "./money.js";

export const ARTIFACT_KINDS = [
	"code_diff",
	"deck",
	"contract",
	"dashboard",
	"screenshot",
	"drafted_email",
	"design",
	"data_analysis",
	"decision",
	"running_service",
	"comm_draft",
	"verification",
	"unknown_kind",
] as const;

export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

export interface DiffHunk {
	readonly header: string;
	readonly lines: ReadonlyArray<{ kind: "add" | "del" | "ctx"; text: string }>;
}

export type ArtifactPreview =
	| { kind: "code_diff"; file: string; hunks: ReadonlyArray<DiffHunk> }
	| { kind: "deck"; slideCount: number; firstSlideTitle: string }
	| { kind: "contract"; parties: ReadonlyArray<string>; title: string }
	| { kind: "dashboard"; metrics: ReadonlyArray<{ label: string; value: string }> }
	| { kind: "screenshot"; imageUrl: string; width: number; height: number }
	| {
			kind: "drafted_email";
			to: ReadonlyArray<string>;
			subject: string;
			bodyExcerpt: string;
	  }
	| { kind: "design"; imageUrl: string; width: number; height: number }
	| { kind: "data_analysis"; findings: ReadonlyArray<string> }
	| { kind: "decision"; claim: string; rationale: string }
	| {
			kind: "running_service";
			url: string;
			status: "ok" | "degraded" | "down";
			statusLabel: string;
	  }
	| { kind: "comm_draft"; channel: string; firstMessage: string }
	| { kind: "verification"; suite: string; passed: number; failed: number };

export interface ArtifactCostFromSession {
	readonly money: WireMoney | null;
	readonly tokens: TokenUsage | null;
}

export interface Artifact {
	readonly id: string;
	readonly producingTaskId: string;
	readonly producingTaskTitle: string;
	readonly kind: ArtifactKind;
	readonly preview: ArtifactPreview | null;
	readonly cost: ArtifactCostFromSession;
	readonly threadCount: number;
	readonly createdAt: string;
}

export interface ArtifactPage {
	readonly items: ReadonlyArray<Artifact>;
	readonly nextCursor: string | null;
}

export type ArtifactFilterAxis =
	| { axis: "task"; taskId: string }
	| { axis: "bet"; betId: string }
	// @lore U1: `productId` renamed to `teamId` (references `teams.id`, domain entity).
	| { axis: "product"; teamId: string }
	| { axis: "portfolio" };

export interface ArtifactQuery {
	readonly limit?: number;
	readonly cursor?: string | null;
	readonly sort?: "created_at_desc";
}

export interface CreateArtifactInput {
	readonly producingTaskId: string;
	readonly kind: Exclude<ArtifactKind, "unknown_kind">;
	readonly preview: ArtifactPreview | null;
	readonly cost: {
		readonly money_micros: number | null;
		readonly tokens_input: number | null;
		readonly tokens_output: number | null;
	} | null;
}

// Single-line summary of a preview, used as the body of an embedded artifact
// reference (no chrome). Returns null when the artifact has no preview yet.
export function summarizePreview(preview: ArtifactPreview | null): string | null {
	if (!preview) return null;
	switch (preview.kind) {
		case "code_diff":
			return preview.file;
		case "deck":
			return `${preview.slideCount} slides — ${preview.firstSlideTitle}`;
		case "screenshot":
		case "design":
			return `${preview.width}×${preview.height}`;
		case "dashboard":
			return preview.metrics.map((m) => `${m.label}: ${m.value}`).join(" · ");
		case "verification":
			return `Suite: ${preview.suite} · Passed: ${preview.passed} · Failed: ${preview.failed}`;
		case "contract":
			return `Title: ${preview.title} · Parties: ${preview.parties.join(", ")}`;
		case "drafted_email":
			return preview.subject;
		case "decision":
			return preview.claim;
		case "data_analysis":
			return "Findings";
		case "comm_draft":
			return preview.channel;
		case "running_service":
			return `URL: ${preview.url} · Status: ${preview.statusLabel}`;
	}
}

// Display title for an artifact: pulled from the kind-specific preview field
// when available, otherwise the producing task title. Used by gallery card,
// stack item, and full preview header so they cannot drift.
export function artifactDisplayTitle(
	artifact: Pick<Artifact, "preview" | "producingTaskTitle">,
): string {
	const p = artifact.preview;
	if (!p) return artifact.producingTaskTitle;
	switch (p.kind) {
		case "code_diff":
			return p.file;
		case "deck":
			return p.firstSlideTitle;
		case "contract":
			return p.title;
		case "decision":
			return p.claim;
		case "drafted_email":
			return p.subject;
		case "comm_draft":
			return p.firstMessage;
		default:
			return artifact.producingTaskTitle;
	}
}
