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
				`bg-[var(--surface-elevated)] rounded-[var(--r-default)] p-[var(--density-card-pad)] flex flex-col gap-[var(--density-card-gap)] max-w-[320px] shadow-[var(--shadow-default)] border hover:translate-y-[-2px] hover:shadow-[var(--shadow-elevated)] transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)] ${state === "blocked" ? "border-[var(--status-error)]" : "border-[var(--border-subtle)]"}`,
			)}
		>
			<span
				className="text-[length:var(--density-text)] font-medium truncate text-[var(--text-primary)]"
				aria-label={`Task: ${title}`}
			>
				{title}
			</span>
			<div className="flex items-center gap-[var(--density-gap)]">
				{betTag && <Tag label={betTag} />}
				<StatusChip status={taskStateToStatus(state)} />
			</div>
			<span className="text-[12px] text-[var(--text-primary)]">{owner}</span>
			{cost && <KeyValue label="Cost" value={cost} />}
			{actions}
		</div>
	);
}
