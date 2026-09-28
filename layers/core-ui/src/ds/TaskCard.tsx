import type { TaskState } from "@hyperidle/domain-model";
import type { JSX, ReactNode } from "react";
import { clickableProps } from "./clickable";
import { dsProps } from "./ds-attrs";
import { StatusChip } from "./StatusChip";
import { taskStateToStatus } from "./status-mapping";
import { Tag } from "./Tag";

export interface TaskCardProps {
	title: string;
	/**
	 * The agent or person who owns this task. Optional: an unowned task is a real
	 * state (`proposed` tasks often have no owner yet), and a card must not
	 * invent one.
	 */
	owner?: string;
	state: TaskState;
	/**
	 */
	team?: string;

	parentTag?: string;
	actions?: ReactNode;
	onClick?: () => void;
}

export function TaskCard({
	title,
	owner,
	state,
	team,
	parentTag,
	actions,
	onClick,
}: TaskCardProps): JSX.Element {
	return (
		<div
			{...dsProps("TaskCard", "2")}
			{...clickableProps(
				onClick,
				"motion-move border-width-thin border-[var(--border-subtle)] bg-[var(--surface-elevated)] rounded-[var(--r-default)] p-[18px] flex flex-col gap-[6px] max-w-[320px] shadow-[var(--shadow-default)] hover:translate-y-[-2px] hover:shadow-[var(--shadow-elevated)]",
			)}
		>
			<span className="type-copy   truncate text-[var(--text-primary)]">{title}</span>
			<div className="flex items-center gap-[12px]">
				{parentTag && <Tag label={parentTag} />}
				<StatusChip status={taskStateToStatus(state)} />
			</div>
			{(owner ?? team) !== undefined && (
				<span className="type-metadata  text-[var(--text-primary)]">{owner ?? `Team ${team}`}</span>
			)}
			{actions}
		</div>
	);
}
