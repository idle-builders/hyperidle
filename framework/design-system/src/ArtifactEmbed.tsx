// L3 — ArtifactEmbed: chrome-less. The host (review message, etc.) owns
// background/border/radius. Only the arrow is interactive.

import type { Artifact } from "@hyperidle/domain-model";
import { summarizePreview } from "@hyperidle/domain-model";
import type { JSX, ReactNode } from "react";
import { ArtifactKindBadge } from "./ArtifactKindBadge.js";
import { ArtifactTimestamp } from "./ArtifactTimestamp.js";
import { dsProps } from "./ds-attrs.js";

/**
 * @lore L3 review fix D-B5: delegated `<ArtifactView>` mount per approved.md
 * §2 line 121 + §7 row 4. The design system package cannot import from
 * `layers/core-ui` (that would invert the dep direction), so the embed exposes
 * a `viewSlot` injection point.
 *
 * @lore AM5 K5: `<ArtifactView>` shell has been DELETED (it was the second caller
 * of the now-removed `getRenderer(kind)`; its `viewSlot=` prop was never populated
 * in production — `viewSlot ?? summary` always fell to the summary path). The
 * `viewSlot` prop is kept for API stability but the deleted `ArtifactView` no
 * longer provides the implementation. Artifact content is now rendered by
 * `ArtifactPreviewSurface` composing `composeArtifactBody` (the block payloads).
 * A future WP may use `viewSlot` for custom host content; for now it remains a
 * no-op extension point.
 */
export interface ArtifactEmbedProps {
	data: Artifact;
	onOpen: () => void;
	viewSlot?: ReactNode;
}

const WRAP = "flex flex-col gap-[4px]";
const IDENTITY =
	"flex items-center gap-[6px] font-mono text-[11px] text-[var(--text-tertiary)] tracking-[var(--tracking-caps-sm)] uppercase";
const VIEW = "text-[var(--text-secondary)] font-sans text-[13px] normal-case [letter-spacing:0]";
const ARROW =
	"ml-auto cursor-pointer px-[6px] py-[4px] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)] focus-visible:[outline-offset:-1px]";

export function ArtifactEmbed({ data, onOpen, viewSlot }: ArtifactEmbedProps): JSX.Element {
	const summary = summarizePreview(data.preview) ?? "[ no preview ]";
	return (
		<div {...dsProps("ArtifactEmbed", "2")} className={WRAP}>
			<div className={IDENTITY}>
				<ArtifactKindBadge kind={data.kind} />
				{data.label && (
					<>
						<span className="text-[var(--text-tertiary)]">/</span>
						<span className="text-[var(--text-tertiary)]">{data.label}</span>
					</>
				)}
				<span className="text-[var(--text-tertiary)]">·</span>
				<span>{data.producingTaskTitle}</span>
				<span className="text-[var(--text-tertiary)]">·</span>
				<ArtifactTimestamp value={data.createdAt} />
				<button type="button" aria-label="Open artifact" className={ARROW} onClick={onOpen}>
					→
				</button>
			</div>
			<div className={VIEW}>{viewSlot ?? summary}</div>
		</div>
	);
}
