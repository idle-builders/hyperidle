import type { TaskState } from "@hyperidle/shared";
import type { JSX, ReactNode } from "react";
import { clickableProps } from "./clickable";
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
			{...clickableProps(
				onClick,
				`bg-base-200 rounded-lg p-2 flex flex-col gap-1 ${state === "blocked" ? "border border-error" : ""}`,
			)}
		>
			<span className="text-sm font-medium truncate" aria-label={`Task: ${title}`}>
				{title}
			</span>
			<div className="flex items-center gap-2">
				{betTag && <Tag label={betTag} />}
				<StatusChip status={taskStateToStatus(state)} />
			</div>
			<span className="text-xs">{owner}</span>
			{cost && <KeyValue label="Cost" value={cost} />}
			{actions}
		</div>
	);
}
