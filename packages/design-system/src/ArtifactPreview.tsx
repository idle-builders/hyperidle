import type { Artifact } from "@hyperidle/shared";
import type { JSX, ReactNode } from "react";
import { ArtifactCostChip } from "./ArtifactCostChip.js";
import { ArtifactKindBadge } from "./ArtifactKindBadge.js";
import { ArtifactPreviewSurface } from "./ArtifactPreviewSurface.js";
import { ArtifactTimestamp } from "./ArtifactTimestamp.js";
import { dsProps } from "./ds-attrs.js";

export interface ArtifactPreviewProps {
	data: Artifact;
	discussion?: ReactNode;
	state?: "populated" | "loading" | "error";
}

const WRAP =
	"bg-[var(--surface-3)] rounded-[var(--r2)] p-[24px] grid grid-cols-1 [@media(min-width:1024px)]:grid-cols-[1fr_320px] gap-[24px]";
const HEADER = "[grid-column:1/-1] flex flex-col gap-[8px]";
const META =
	"flex items-center gap-[6px] font-mono text-[11px] text-[var(--text-mid)] uppercase tracking-[0.02em] flex-wrap";
const TITLE = "text-[20px] font-semibold text-[var(--text-hi)] leading-[1.2] normal-case";
const DISCUSSION =
	"bg-[var(--surface-2)] rounded-[var(--r1)] p-[16px] text-[var(--text-lo)] text-[12px]";

function previewTitle(data: Artifact): string {
	const p = data.preview;
	if (!p) return data.producingTaskTitle;
	switch (p.kind) {
		case "decision":
			return p.claim;
		case "drafted_email":
			return p.subject;
		case "code_diff":
			return p.file;
		case "deck":
			return p.firstSlideTitle;
		case "contract":
			return p.title;
		case "comm_draft":
			return p.firstMessage;
		default:
			return data.producingTaskTitle;
	}
}

export function ArtifactPreview({
	data,
	discussion,
	state = "populated",
}: ArtifactPreviewProps): JSX.Element {
	return (
		<div {...dsProps("ArtifactPreview", "2")} className={WRAP} data-state={state}>
			<div className={HEADER}>
				<div className={META}>
					<ArtifactKindBadge kind={data.kind} />
					<span className="text-[var(--text-lo)]">·</span>
					<span>{data.producingTaskTitle}</span>
					<span className="text-[var(--text-lo)]">·</span>
					<ArtifactCostChip cost={data.cost} variant="full" />
					<span className="text-[var(--text-lo)]">·</span>
					<ArtifactTimestamp value={data.createdAt} />
					<span className="ml-auto text-[var(--text-lo)] normal-case">{data.id}</span>
				</div>
				<div className={TITLE}>{previewTitle(data)}</div>
			</div>
			<ArtifactPreviewSurface kind={data.kind} preview={data.preview} size="full" />
			{discussion ? <div className={DISCUSSION}>{discussion}</div> : null}
		</div>
	);
}
