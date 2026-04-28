// L3 — ArtifactEmbed: chrome-less. The host (review message, etc.) owns
// background/border/radius. Only the arrow is interactive.

import type { Artifact } from "@hyperidle/shared";
import { getArtifactViewProps } from "@hyperidle/shared";
import type { JSX } from "react";
import { ArtifactCostChip } from "./ArtifactCostChip.js";
import { ArtifactKindBadge } from "./ArtifactKindBadge.js";
import { ArtifactTimestamp } from "./ArtifactTimestamp.js";
import { dsProps } from "./ds-attrs.js";

export interface ArtifactEmbedProps {
	data: Omit<Artifact, "threadCount"> & { threadCount?: number };
	onOpen: () => void;
}

const WRAP = "flex flex-col gap-[4px]";
const IDENTITY =
	"flex items-center gap-[6px] font-mono text-[11px] text-[var(--text-lo)] tracking-[0.02em] uppercase";
const VIEW = "text-[var(--text-mid)] font-sans text-[13px] normal-case [letter-spacing:0]";
const ARROW =
	"ml-auto cursor-pointer px-[6px] py-[4px] hover:text-[var(--text-hi)] focus:outline focus:outline-2 focus:outline-[var(--accent)]";

function viewSummary(data: ArtifactEmbedProps["data"]): string {
	const v = getArtifactViewProps(data as Artifact);
	if (v === "no_view") return "[ no preview ]";
	switch (v.shape) {
		case "text_diff":
			return v.file;
		case "deck":
			return `${v.slideCount} slides — ${v.firstSlideTitle}`;
		case "image":
			return `${v.width}×${v.height}`;
		case "key_value":
			return v.rows.map((r) => `${r.label}: ${r.value}`).join(" · ");
		case "prose":
			return v.title;
	}
}

export function ArtifactEmbed({ data, onOpen }: ArtifactEmbedProps): JSX.Element {
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
			<div className={VIEW}>{viewSummary(data)}</div>
		</div>
	);
}
