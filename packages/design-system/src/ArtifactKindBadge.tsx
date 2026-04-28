import type { ArtifactKind } from "@hyperidle/shared";
import type { JSX } from "react";
import { dsProps } from "./ds-attrs.js";

export interface ArtifactKindBadgeProps {
	kind: ArtifactKind;
}

const BADGE_BASE =
	"inline-flex items-center px-[8px] py-[2px] rounded-[var(--r2)] bg-[var(--surface-ghost)] text-[var(--text-mid)] font-mono text-[11px] tracking-[0.02em] uppercase whitespace-nowrap";

function kindLabel(kind: ArtifactKind): string {
	return kind.replace(/_/g, " ").toUpperCase();
}

export function ArtifactKindBadge({ kind }: ArtifactKindBadgeProps): JSX.Element {
	return (
		<span {...dsProps("ArtifactKindBadge", "1")} className={BADGE_BASE}>
			{kindLabel(kind)}
		</span>
	);
}
