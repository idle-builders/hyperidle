/**
 * @lore AU44-b8: artifactDisplayTitle + summarizePreview moved from
 * framework/domain-model/src/types/artifact.ts to core-ui.
 * All consumers are UI-world. Audit rows 39 & 40: MERGE → design-system (=core-ui).
 */

import { getKindDefinition } from "@hyperidle/domain-model";
import type { Artifact } from "@hyperidle/domain-model";

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
