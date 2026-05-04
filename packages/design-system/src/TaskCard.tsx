import type { TaskState } from "@hyperidle/shared";
import type { JSX, ReactNode } from "react";
import { clickableProps } from "./clickable";
import { dsProps } from "./ds-attrs";
import { KeyValue } from "./KeyValue";
import { StatusChip } from "./StatusChip";
import { taskStateToStatus } from "./status-mapping";
import { Tag } from "./Tag";

export interface TaskCardProps {
	title: string;
	owner: string;
	state: TaskState;
	cost?: string;
	betTag?: string;
	actions?: ReactNode;
	onClick?: () => void;
}

export function TaskCard({
	title,
	owner,
	state,
	cost,
	betTag,
	actions,
	onClick,
}: TaskCardProps): JSX.Element {
	return (
		<div
			{...dsProps("TaskCard", "2")}
			/*
			 * @lore K11: outer pad → --density-card-pad, inner gap →
			 * --density-card-gap, row gap → --density-gap, title →
			 * --density-text per density-audit.md § 3.2.5. The max-w-[320px]
			 * stays literal — Kanban-column geometry (per § 3.2.5 + § 3.3.K7).
			 * Owner font stays literal 12 px (chrome).
			 */
			{...clickableProps(
				onClick,
				`bg-[var(--surface-4)] rounded-[var(--r2)] p-[var(--density-card-pad)] flex flex-col gap-[var(--density-card-gap)] max-w-[320px] ${state === "blocked" ? "border border-[var(--danger)]" : ""}`,
			)}
		>
			<span
				className="text-[length:var(--density-text)] font-medium truncate text-[var(--text-hi)]"
				aria-label={`Task: ${title}`}
			>
				{title}
			</span>
			<div className="flex items-center gap-[var(--density-gap)]">
				{betTag && <Tag label={betTag} />}
				<StatusChip status={taskStateToStatus(state)} />
			</div>
			<span className="text-[12px] text-[var(--text-hi)]">{owner}</span>
			{cost && <KeyValue label="Cost" value={cost} />}
			{actions ? (
				/*
				 * @lore L15: action footer divider — 1px subtle border, mt/pt
				 * use `var(--density-card-gap)` (8px default / 4px compact / 8px
				 * comfortable) per Design MF-1. The previous `var(--density-gap)`
				 * resolved to 12px and made the footer look glued to the next
				 * card. Card-gap is the right axis: it scales with density and
				 * stays inside the K10 density-aware allowlist. Slot rendered
				 * only when `actions` is provided so terminal/orphan cards
				 * shrink by ~28 px.
				 */
				<div className="border-t border-[var(--border-subtle)] mt-[var(--density-card-gap)] pt-[var(--density-card-gap)]">
					{actions}
				</div>
			) : null}
		</div>
	);
}
