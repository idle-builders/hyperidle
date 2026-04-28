// L3 — Artifact primitive type definitions.
// Source: docs/architecture-plans/L3.md §3.

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
	readonly money: string | null;
	readonly tokens: string | null;
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
	| { axis: "product"; productId: string }
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

// ArtifactView shape descriptor: the 5 view shapes a renderer can request
// (per approved-design §6). Returned by getArtifactViewProps so callers
// (ArtifactPreviewSurface, ArtifactEmbed) dispatch identically.
export type ArtifactViewProps =
	| { shape: "text_diff"; file: string; hunks: ReadonlyArray<DiffHunk> }
	| { shape: "deck"; slideCount: number; firstSlideTitle: string }
	| {
			shape: "image";
			imageUrl: string;
			width: number;
			height: number;
	  }
	| { shape: "key_value"; rows: ReadonlyArray<{ label: string; value: string }> }
	| { shape: "prose"; title: string; body: string };

export function getArtifactViewProps(artifact: Artifact): ArtifactViewProps | "no_view" {
	const p = artifact.preview;
	if (!p) return "no_view";
	switch (p.kind) {
		case "code_diff":
			return { shape: "text_diff", file: p.file, hunks: p.hunks };
		case "deck":
			return {
				shape: "deck",
				slideCount: p.slideCount,
				firstSlideTitle: p.firstSlideTitle,
			};
		case "screenshot":
		case "design":
			return {
				shape: "image",
				imageUrl: p.imageUrl,
				width: p.width,
				height: p.height,
			};
		case "dashboard":
			return { shape: "key_value", rows: p.metrics };
		case "verification":
			return {
				shape: "key_value",
				rows: [
					{ label: "Suite", value: p.suite },
					{ label: "Passed", value: String(p.passed) },
					{ label: "Failed", value: String(p.failed) },
				],
			};
		case "contract":
			return {
				shape: "key_value",
				rows: [
					{ label: "Title", value: p.title },
					{ label: "Parties", value: p.parties.join(", ") },
				],
			};
		case "drafted_email":
			return {
				shape: "prose",
				title: p.subject,
				body: `To: ${p.to.join(", ")}\n\n${p.bodyExcerpt}`,
			};
		case "decision":
			return { shape: "prose", title: p.claim, body: p.rationale };
		case "data_analysis":
			return {
				shape: "prose",
				title: "Findings",
				body: p.findings.join("\n"),
			};
		case "comm_draft":
			return {
				shape: "prose",
				title: p.channel,
				body: p.firstMessage,
			};
		case "running_service":
			return {
				shape: "key_value",
				rows: [
					{ label: "URL", value: p.url },
					{ label: "Status", value: p.statusLabel },
				],
			};
	}
}
