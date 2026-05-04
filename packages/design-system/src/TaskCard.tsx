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
	/**
	 * L15 § 3.4 — when set, the cost slot is replaced by the dashed-border
	 * `↪ PENDING` chip. Clicking the chip should open the task's thread (the
	 * page wires `onPendingChipClick` to the same handler as the menu's
	 * `Open thread`).
	 */
	pendingRequest?: PendingRequestSummary | null;
	onPendingChipClick?: () => void;
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
	onPendingChipClick,
}: TaskCardProps): JSX.Element {
	const isPending = Boolean(pendingRequest);
	return (
		<div
			{...dsProps("TaskCard", "2")}
			data-pending={isPending ? "true" : "false"}
			/*
			 * @lore K11: outer pad → --density-card-pad, inner gap →
			 * --density-card-gap, row gap → --density-gap, title →
			 * --density-text per density-audit.md § 3.2.5. The max-w-[320px]
			 * stays literal — Kanban-column geometry (per § 3.2.5 + § 3.3.K7).
			 * Owner font stays literal 12 px (chrome).
			 *
			 * @lore L15: relative positioning anchors the absolutely-positioned
			 * TaskActionsMenu trigger and the menu surface to the card's
			 * top-right corner — per packages/design-system/html/TaskCard.html.
			 */
			{...clickableProps(
				onClick,
				`relative bg-[var(--surface-4)] rounded-[var(--r2)] p-[var(--density-card-pad)] flex flex-col gap-[var(--density-card-gap)] max-w-[320px] ${state === "blocked" ? "border border-[var(--danger)]" : ""}`,
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
			{isPending ? (
				<button
					type="button"
					data-component="TaskCardPendingChip"
					title={
						pendingRequest
							? `Requested: ${pendingRequest.verb}`
							: "Pending request"
					}
					onClick={(e) => {
						e.stopPropagation();
						onPendingChipClick?.();
					}}
					className="self-start inline-flex items-center gap-[4px] px-[6px] py-[2px] min-h-[44px] min-[1025px]:min-h-0 rounded-[var(--r-pill)] font-heading text-[11px] tracking-[0.05em] uppercase text-[var(--text-mid)] bg-[var(--surface-ghost)] border border-dashed border-[var(--border-default)] cursor-pointer hover:bg-[var(--primary-dim)] hover:text-[var(--text-hi)]"
				>
					<span aria-hidden>↪</span>
					<span>Pending</span>
				</button>
			) : (
				cost && <KeyValue label="Cost" value={cost} />
			)}
			{actions}
		</div>
	);
}
