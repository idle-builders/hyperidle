import type { Artifact } from "@hyperidle/domain-model";
import { artifactDisplayTitle } from "@hyperidle/domain-model";
import type { JSX } from "react";
import { ArtifactKindBadge } from "./ArtifactKindBadge.js";
import { ArtifactTimestamp } from "./ArtifactTimestamp.js";
import { dsProps } from "./ds-attrs.js";

export interface ArtifactStackItemProps {
	data: Artifact;
	onOpen: () => void;
	state?: "populated" | "loading" | "error";
}

const ROW =
	"flex items-center gap-[12px] h-[44px] px-[12px] cursor-pointer hover:bg-[color-mix(in_oklab,var(--accent-primary)_4%,var(--surface-elevated))] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)] focus-visible:[outline-offset:-1px] w-full text-left";
const LEFT = "flex items-center gap-[9px] flex-1 min-w-0";
/**
 * @lore UI-149: title is the primary flex-1 column so it claims remaining space and
 * truncates cleanly. task is the secondary context column — fixed max-width so it
 * never crowds the title. This gives aligned "columns" across rows without a CSS grid.
 *
 * @lore NEW-17: max-widths raised after coordinator measured real content widths:
 * label needed 192–244px (was capped at 100px), task needed 260–311px (was capped at
 * 200px). Raised to 250px and 320px respectively so content shows without truncation.
 * Title (flex-1) absorbs whatever space remains.
 */
const TASK = "text-[var(--text-secondary)] shrink-0 max-w-[320px] truncate";
const TITLE = "text-[var(--text-primary)] flex-1 min-w-0 truncate";
const RIGHT = "flex items-center gap-[9px] text-[var(--text-secondary)]";
const PILL =
	"bg-[color-mix(in_oklab,var(--text-secondary)_8%,transparent)] text-[var(--text-secondary)] rounded-[var(--r-pill)] px-[6px] py-[1px]";

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
				<span className={`type-copy ${TITLE}`}>{artifactDisplayTitle(data)}</span>
				{data.label && (
					<span className="type-label shrink-0 max-w-[250px] truncate text-[var(--text-tertiary)] uppercase">
						{data.label}
					</span>
				)}
				<span className={`type-data ${TASK}`}>{data.producingTaskTitle}</span>
			</span>
			<span className={`type-data ${RIGHT}`}>
				{count > 0 ? (
					<span className={PILL}>{count === 1 ? "1 thread" : `${count} threads`}</span>
				) : null}
				<ArtifactTimestamp value={data.createdAt} />
			</span>
		</button>
	);
}
