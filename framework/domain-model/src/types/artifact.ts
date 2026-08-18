// AE6 — Artifact primitive type definitions.
// Reshaped from L3 (13 business-domain kinds) to AE6 (6 fundamental kinds + labels).
// Source: plans/AE6/architecture.md §1.

import { getKindDefinition } from "../kinds/registry.js";

// Per-kind preview types and the fundamental kinds, re-exported from the registry — the canonical
// source of truth, and now the one module that declares them.
export {
	ARTIFACT_KINDS,
	type ArtifactKind,
	type CodePreview,
	type DataPreview,
	type HtmlPreview,
	type ImagePreview,
	isRegisteredKind,
	type TextPreview,
	type UrlPreview,
} from "../kinds/registry.js";

import type {
	CodePreview,
	DataPreview,
	HtmlPreview,
	ImagePreview,
	TextPreview,
	UrlPreview,
} from "../kinds/registry.js";

/**
 * Union of all registered preview types.
 * Used where the preview kind is constrained to the 6 fundamental kinds.
 */
export type ArtifactPreview =
	| TextPreview
	| CodePreview
	| ImagePreview
	| DataPreview
	| HtmlPreview
	| UrlPreview;

export interface Artifact {
	readonly id: string;
	readonly producingTaskId: string;
	readonly producingTaskTitle: string;
	/** Open vocabulary — the 6 fundamental kinds are registered; others render fallback. */
	readonly kind: string;
	/** Optional business-domain tag. Does NOT affect renderer selection. */
	readonly label: string | null;
	/** Preview data, or null when not yet available. */
	readonly preview: ArtifactPreview | null;
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

/**
 * Single-line summary of a preview. Delegates to the Kind Definition registry.
 * Returns null when the artifact has no preview or the kind is unregistered with no useful data.
 *
 * @lore AE6: summarizePreview now delegates to Kind Definition registry instead of
 * a closed switch statement. Unregistered kinds return the kind string as fallback.
 */
export function summarizePreview(preview: unknown): string | null {
	if (!preview || typeof preview !== "object") return null;
	if (!("kind" in preview)) return null;
	const kind = (preview as { kind: string }).kind;
	const def = getKindDefinition(kind);
	if (def) return def.summarize(preview);
	// Fallback: return the kind string for unregistered kinds
	return kind;
}

/**
 * Display title for an artifact: pulled from the kind-specific preview field
 * when available, otherwise the producing task title.
 * Used by gallery card, stack item, and full preview header so they cannot drift.
 *
 * @lore AE6: artifactDisplayTitle now delegates to Kind Definition registry.
 * The preview parameter is typed as unknown to handle open-vocabulary kinds.
 */
export function artifactDisplayTitle(
	artifact: Pick<Artifact, "preview" | "producingTaskTitle">,
): string {
	if (!artifact.preview) return artifact.producingTaskTitle;
	const def = getKindDefinition((artifact.preview as { kind: string }).kind);
	if (def) {
		const title = def.displayTitle(artifact.preview);
		if (title) return title;
	}
	return artifact.producingTaskTitle;
}
