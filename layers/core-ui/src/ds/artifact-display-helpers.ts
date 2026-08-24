/**
 * @lore AU44-b8: artifactDisplayTitle moved from
 * framework/domain-model/src/types/artifact.ts to core-ui.
 * All consumers are UI-world. Audit row 39: MERGE → design-system (=core-ui).
 * summarizePreview (row 40) had no UI caller; domain-model copy survives for its own test.
 */

import type { Artifact } from "@hyperidle/domain-model";
import { getKindDefinition } from "@hyperidle/domain-model";

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
