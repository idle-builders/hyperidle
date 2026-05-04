import type { PendingRequestSummary, TaskState } from "@hyperidle/shared";
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
	/** L15: when set, replaces the cost slot with a pending status chip. */
	pendingRequest?: PendingRequestSummary | null;
	/** L15: invoked on card-body activation (click / keypress). */
	onActivate?: () => void;
}

export function TaskCard({
	title,
	owner,
	state,
	cost,
	betTag,
	actions,
	onClick,
	pendingRequest,
	onActivate,
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
				onActivate ?? onClick,
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
			{pendingRequest ? (
				<StatusChip status="request_pending" />
			) : cost ? (
				<KeyValue label="Cost" value={cost} />
			) : null}
			{actions}
		</div>
	);
}
