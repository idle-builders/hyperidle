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
	/**
	 * @lore L15: optional kebab-menu slot. Absolute-positioned top-right,
	 * opacity-0 by default; revealed on `:hover`/`:focus-within` of the card
	 * or when an ancestor sets `[data-density="comfortable"]` (AQ-016 mobile rule).
	 * Additive — when omitted, rendered DOM is identical to pre-L15 TaskCard.
	 */
	overflowMenu?: ReactNode;
}

export function TaskCard({
	title,
	owner,
	state,
	cost,
	betTag,
	actions,
	onClick,
	overflowMenu,
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
			 *
			 * @lore L15: `relative` is added unconditionally so the
			 * absolute-positioned `overflowMenu` slot anchors. Visual parity
			 * preserved when overflowMenu is undefined (slot is not rendered).
			 */
			{...clickableProps(
				onClick,
				`relative group bg-[var(--surface-4)] rounded-[var(--r2)] p-[var(--density-card-pad)] max-w-[320px] [&>*+*]:mt-[var(--density-card-gap)] ${state === "blocked" ? "border border-[var(--danger)]" : ""}`,
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
			{actions}
			{overflowMenu !== undefined && (
				<div
					data-task-overflow
					className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [[data-density=comfortable]_&]:opacity-100 transition-opacity duration-[var(--motion-fast)]"
				>
					{overflowMenu}
				</div>
			)}
		</div>
	);
}
