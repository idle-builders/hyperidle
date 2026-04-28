import type { Artifact } from "@hyperidle/shared";
import { artifactDisplayTitle } from "@hyperidle/shared";
import type { JSX } from "react";
import { ArtifactCostChip } from "./ArtifactCostChip.js";
import { ArtifactKindBadge } from "./ArtifactKindBadge.js";
import { ArtifactPreviewSurface } from "./ArtifactPreviewSurface.js";
import { ArtifactTimestamp } from "./ArtifactTimestamp.js";
import { dsProps } from "./ds-attrs.js";

export interface ArtifactGalleryCardProps {
	data: Artifact;
	onOpen: () => void;
	state?: "populated" | "loading" | "error";
}

// @lore L3 review fix D-B1: focus ring uses --primary; --accent is not a token.
const CARD_BASE =
	"bg-[var(--surface-4)] rounded-[var(--r2)] p-[12px] flex flex-col gap-[8px] cursor-pointer hover:bg-[var(--surface-5)] focus:outline focus:outline-2 focus:outline-[var(--primary)]";
const HEADER =
	"flex items-center gap-[6px] font-mono text-[11px] tracking-[0.02em] uppercase text-[var(--text-mid)]";
// @lore L3 review fix D-B2: derived title row per approved.md §2 + HTML ref line 29
// (15px / weight 500 / --text-hi / line-height 1.3).
const TITLE = "text-[15px] font-medium text-[var(--text-hi)] leading-[1.3]";
const FOOTER = "flex items-center justify-between font-mono text-[11px] text-[var(--text-mid)]";
const PILL =
	"bg-[var(--surface-ghost)] text-[var(--text-mid)] rounded-[var(--r-pill)] px-[8px] py-[2px]";

export function ArtifactGalleryCard({
	data,
	onOpen,
	state = "populated",
}: ArtifactGalleryCardProps): JSX.Element {
	const count = data.threadCount;
	return (
		<button
			{...dsProps("ArtifactGalleryCard", "2")}
			className={CARD_BASE}
			onClick={onOpen}
			type="button"
			data-state={state}
			aria-label={artifactDisplayTitle(data)}
		>
			<div className={HEADER}>
				<ArtifactKindBadge kind={data.kind} />
				<span className="text-[var(--text-lo)]">·</span>
				<span>{data.producingTaskTitle}</span>
			</div>
			<div className={TITLE}>{artifactDisplayTitle(data)}</div>
			<ArtifactPreviewSurface kind={data.kind} preview={data.preview} size="gallery" />
			<div className={FOOTER}>
				<span className="flex items-center gap-[6px]">
					<ArtifactCostChip cost={data.cost} variant="compact" />
					<span className="text-[var(--text-lo)]">·</span>
					<ArtifactTimestamp value={data.createdAt} />
				</span>
				{count > 0 ? (
					<span className={PILL}>{count === 1 ? "1 thread" : `${count} threads`}</span>
				) : null}
			</div>
		</button>
	);
}
