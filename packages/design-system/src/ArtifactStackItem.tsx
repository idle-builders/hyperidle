import type { Artifact } from "@hyperidle/shared";
import { artifactDisplayTitle } from "@hyperidle/shared";
import type { JSX } from "react";
import { ArtifactCostChip } from "./ArtifactCostChip.js";
import { ArtifactKindBadge } from "./ArtifactKindBadge.js";
import { ArtifactTimestamp } from "./ArtifactTimestamp.js";
import { dsProps } from "./ds-attrs.js";

export interface ArtifactStackItemProps {
	data: Artifact;
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

export function ArtifactStackItem({
	data,
	onOpen,
	state = "populated",
}: ArtifactStackItemProps): JSX.Element {
	const count = data.threadCount;
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
				<span className={TITLE}>{artifactDisplayTitle(data)}</span>
			</span>
			<span className={RIGHT}>
				{count > 0 ? (
					<span className={PILL}>{count === 1 ? "1 thread" : `${count} threads`}</span>
				) : null}
				<ArtifactCostChip cost={data.cost} variant="compact" />
				<span className="text-[var(--text-lo)]">·</span>
				<ArtifactTimestamp value={data.createdAt} />
			</span>
		</button>
	);
}
