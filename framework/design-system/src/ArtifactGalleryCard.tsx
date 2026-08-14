import type { Artifact } from "@hyperidle/domain-model";
import { artifactDisplayTitle } from "@hyperidle/domain-model";
import type { JSX } from "react";
import { ArtifactKindBadge } from "./ArtifactKindBadge.js";
import { ArtifactPreviewSurface } from "./ArtifactPreviewSurface.js";
import { ArtifactTimestamp } from "./ArtifactTimestamp.js";
import { dsProps } from "./ds-attrs.js";

export interface ArtifactGalleryCardProps {
	data: Artifact;
	onOpen: () => void;
	state?: "populated" | "loading" | "error";
}

const CARD_BASE =
	"bg-[var(--surface-elevated)] rounded-[var(--r-default)] p-[12px] flex flex-col gap-[9px] cursor-pointer shadow-[var(--shadow-default)] border border-[var(--border-subtle)] hover:translate-y-[-2px] hover:shadow-[var(--shadow-elevated)] transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)]";
const HEADER =
	"flex items-center gap-[6px] font-mono text-[11px] tracking-[var(--tracking-caps-sm)] uppercase text-[var(--text-secondary)]";
// @lore L3 review fix D-B2: derived title row per approved.md §2 + HTML ref line 29.
const TITLE = "text-[15px] font-medium text-[var(--text-primary)] leading-[1.3]";
const FOOTER =
	"flex items-center justify-between font-mono text-[11px] text-[var(--text-secondary)]";
const PILL =
	"bg-[color-mix(in_oklab,var(--text-secondary)_8%,transparent)] text-[var(--text-secondary)] rounded-[var(--r-pill)] px-[8px] py-[2px]";

export function ArtifactGalleryCard({
	data,
	onOpen,
	state = "populated",
}: ArtifactGalleryCardProps): JSX.Element {
	const count = data.threadCount;
	return (
		<button
			{...dsProps("ArtifactGalleryCard", "2")}
			className={`motion-move ${CARD_BASE}`}
			onClick={onOpen}
			type="button"
			data-state={state}
			aria-label={artifactDisplayTitle(data)}
		>
			<div className={`type-data ${HEADER}`}>
				<ArtifactKindBadge kind={data.kind} />
				{data.label && (
					<>
						<span className="text-[var(--text-tertiary)]">/</span>
						<span className="text-[var(--text-tertiary)]">{data.label}</span>
					</>
				)}
				<span className="text-[var(--text-tertiary)]">·</span>
				<span>{data.producingTaskTitle}</span>
			</div>
			<div className={`type-copy ${TITLE}`}>{artifactDisplayTitle(data)}</div>
			<ArtifactPreviewSurface kind={data.kind} preview={data.preview} size="gallery" />
			<div className={`type-data ${FOOTER}`}>
				<span className="flex items-center gap-[6px]">
					<ArtifactTimestamp value={data.createdAt} />
				</span>
				{count > 0 ? (
					<span className={PILL}>{count === 1 ? "1 thread" : `${count} threads`}</span>
				) : null}
			</div>
		</button>
	);
}
