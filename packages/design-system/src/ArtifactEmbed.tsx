// L3 — ArtifactEmbed: chrome-less. The host (review message, etc.) owns
// background/border/radius. Only the arrow is interactive.

import type { Artifact } from "@hyperidle/shared";
import { summarizePreview } from "@hyperidle/shared";
import type { JSX, ReactNode } from "react";
import { ArtifactCostChip } from "./ArtifactCostChip.js";
import { ArtifactKindBadge } from "./ArtifactKindBadge.js";
import { ArtifactTimestamp } from "./ArtifactTimestamp.js";
import { dsProps } from "./ds-attrs.js";

/**
 * @lore L3 review fix D-B5: delegated `<ArtifactView>` mount per approved.md
 * §2 line 121 + §7 row 4. The design system package cannot import from
 * `packages/web` (that would invert the dep direction), so the embed exposes
 * a `viewSlot` injection point. The host (e.g. a review message in
 * `packages/web`) maps the artifact via `artifactToView(artifact)` and passes
 * the resulting `<ArtifactView .../>` element as `viewSlot`. When `viewSlot`
 * is omitted (or no shape mapping exists for the kind), the embed renders the
 * one-line `summarizePreview` fallback. The embed root remains chrome-less:
 * no bg-/border-/rounded-/shadow- classes (asserted by the protected test).
 */
export interface ArtifactEmbedProps {
	data: Artifact;
	onOpen: () => void;
	viewSlot?: ReactNode;
}

const WRAP = "flex flex-col gap-[4px]";
const IDENTITY =
	"flex items-center gap-[6px] font-mono text-[11px] text-[var(--text-lo)] tracking-[0.02em] uppercase";
const VIEW = "text-[var(--text-mid)] font-sans text-[13px] normal-case [letter-spacing:0]";
// @lore L3 review fix D-B1: focus ring uses --primary; --accent is not a token.
const ARROW =
	"ml-auto cursor-pointer px-[6px] py-[4px] hover:text-[var(--text-hi)] focus:outline focus:outline-2 focus:outline-[var(--primary)]";

export function ArtifactEmbed({ data, onOpen, viewSlot }: ArtifactEmbedProps): JSX.Element {
	const summary = summarizePreview(data.preview) ?? "[ no preview ]";
	return (
		<div {...dsProps("ArtifactEmbed", "2")} className={WRAP}>
			<div className={IDENTITY}>
				<ArtifactKindBadge kind={data.kind} />
				<span className="text-[var(--text-lo)]">·</span>
				<span>{data.producingTaskTitle}</span>
				<span className="text-[var(--text-lo)]">·</span>
				<ArtifactCostChip cost={data.cost} variant="compact" />
				<span className="text-[var(--text-lo)]">·</span>
				<ArtifactTimestamp value={data.createdAt} />
				<button type="button" aria-label="Open artifact" className={ARROW} onClick={onOpen}>
					→
				</button>
			</div>
			<div className={VIEW}>{viewSlot ?? summary}</div>
		</div>
	);
}
