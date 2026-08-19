// AE6: kind widened from ArtifactKind (closed union) to string (open vocabulary).
// @lore AE6: ArtifactKind was a 13-member closed union. With AE6, Artifact.kind
// is a string — any registered or unregistered kind passes through.
// The kindLabel function works for any string.
import type { JSX } from "react";
import { dsProps } from "./ds-attrs.js";

export interface ArtifactKindBadgeProps {
	kind: string;
}

const BADGE_BASE =
	"inline-flex items-center px-[8px] py-[2px] rounded-[var(--r-default)] bg-[color-mix(in_oklab,var(--text-secondary)_8%,transparent)] text-[var(--text-secondary)] uppercase whitespace-nowrap";

/**
 * UI-108: For "unknown" kind (and any future machine-internal sentinel values),
 * show a user-friendly label instead of the raw machine string in uppercase.
 * Known kinds render via the standard underscore→space→uppercase path so that
 * e.g. "code_diff" → "CODE DIFF" (the badge class applies `uppercase` CSS).
 */
const FRIENDLY_KIND_LABELS: Record<string, string> = {
	unknown: "Other",
};

function kindLabel(kind: string): string {
	return FRIENDLY_KIND_LABELS[kind] ?? kind.replace(/_/g, " ").toUpperCase();
}

export function ArtifactKindBadge({ kind }: ArtifactKindBadgeProps): JSX.Element {
	return (
		<span {...dsProps("ArtifactKindBadge", "1")} className={`type-data ${BADGE_BASE}`}>
			{kindLabel(kind)}
		</span>
	);
}
