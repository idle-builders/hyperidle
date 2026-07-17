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
			{...clickableProps(
				onClick,
				`bg-[var(--surface-elevated)] rounded-[var(--r-default)] p-[18px] flex flex-col gap-[6px] max-w-[320px] shadow-[var(--shadow-default)] border hover:translate-y-[-2px] hover:shadow-[var(--shadow-elevated)] transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)] ${state === "blocked" ? "border-[var(--status-error)]" : "border-[var(--border-subtle)]"}`,
			)}
		>
			{/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-label provides "Task: " context prefix for screen readers within the clickable card */}
			<span
				className="text-[15px] font-medium truncate text-[var(--text-primary)]"
				aria-label={`Task: ${title}`}
			>
				{title}
			</span>
			<div className="flex items-center gap-[12px]">
				{betTag && <Tag label={betTag} />}
				<StatusChip status={taskStateToStatus(state)} />
			</div>
			<span className="text-[12px] text-[var(--text-primary)]">{owner}</span>
			{cost && <KeyValue label="Cost" value={cost} />}
			{actions}
		</div>
	);
}
