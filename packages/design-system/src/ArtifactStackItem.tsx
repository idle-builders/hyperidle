import type { Artifact } from "@hyperidle/shared";
import type { JSX } from "react";
import { ArtifactCostChip } from "./ArtifactCostChip.js";
import { ArtifactKindBadge } from "./ArtifactKindBadge.js";
import { ArtifactTimestamp } from "./ArtifactTimestamp.js";
import { dsProps } from "./ds-attrs.js";

export interface ArtifactStackItemProps {
	data: Omit<Artifact, "threadCount"> & { threadCount?: number };
	threadCount?: number;
	onOpen: () => void;
	state?: "populated" | "loading" | "error";
}

const ROW =
	"flex items-center gap-[12px] h-[44px] px-[12px] cursor-pointer hover:bg-[var(--surface-4)] focus:outline focus:outline-2 focus:outline-[var(--accent)] w-full text-left";
const LEFT = "flex items-center gap-[8px] flex-1 min-w-0";
const TASK = "font-mono text-[11px] text-[var(--text-mid)] truncate";
const TITLE = "text-[14px] font-medium text-[var(--text-hi)] truncate";
const RIGHT = "flex items-center gap-[8px] font-mono text-[11px] text-[var(--text-mid)]";
const PILL =
	"bg-[var(--surface-ghost)] text-[var(--text-mid)] rounded-[var(--r-pill)] px-[6px] py-[1px]";

function pluralizeThreads(n: number): string {
	return n === 1 ? "1 thread" : `${n} threads`;
}

function rowTitle(data: Omit<Artifact, "threadCount">): string {
	const p = data.preview;
	if (!p) return data.producingTaskTitle;
	switch (p.kind) {
		case "code_diff":
			return p.file;
		case "deck":
			return p.firstSlideTitle;
		case "contract":
			return p.title;
		case "decision":
			return p.claim;
		case "drafted_email":
			return p.subject;
		case "comm_draft":
			return p.firstMessage;
		default:
			return data.producingTaskTitle;
	}
}

export function ArtifactStackItem({
	data,
	threadCount,
	onOpen,
	state = "populated",
}: ArtifactStackItemProps): JSX.Element {
	const count = threadCount ?? data.threadCount ?? 0;
	return (
		<button
			{...dsProps("ArtifactStackItem", "2")}
			className={ROW}
			onClick={onOpen}
			type="button"
			data-state={state}
		>
			<span className={LEFT}>
				<ArtifactKindBadge kind={data.kind} />
				<span className={TASK}>{data.producingTaskTitle}</span>
				<span className={TITLE}>{rowTitle(data)}</span>
			</span>
			<span className={RIGHT}>
				{count > 0 ? <span className={PILL}>{pluralizeThreads(count)}</span> : null}
				<ArtifactCostChip cost={data.cost} variant="compact" />
				<span className="text-[var(--text-lo)]">·</span>
				<ArtifactTimestamp value={data.createdAt} />
			</span>
		</button>
	);
}
