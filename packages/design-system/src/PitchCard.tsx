// @lore PitchCard uses BetStatus because @hyperidle/shared has no PitchStatus type yet.
// Pitches and bets share a lifecycle in the current spec. If PitchStatus diverges,
// create a dedicated type and mapping function. See architecture review UI-20.
import type { BetStatus } from "@hyperidle/shared";
import type { JSX, ReactNode } from "react";
import { clickableProps } from "./clickable";
import { dsProps } from "./ds-attrs";
import { KeyValue } from "./KeyValue";
import { StatusChip } from "./StatusChip";
import { betStatusToStatus } from "./status-mapping";
import { Tag } from "./Tag";

export interface PitchCardProps {
	title: string;
	hypothesis: string;
	proposer: string;
	status: BetStatus;
	appetite: string;
	kind?: string;
	actions?: ReactNode;
	onClick?: () => void;
}

export function PitchCard({
	title,
	hypothesis,
	proposer,
	status,
	appetite,
	kind,
	actions,
	onClick,
}: PitchCardProps): JSX.Element {
	return (
		<div
			{...dsProps("PitchCard", "2")}
			/*
			 * @lore K11: outer pad → --density-card-pad, inner gap →
			 * --density-card-gap, row gap → --density-gap, title +
			 * hypothesis → --density-text per density-audit.md § 3.2.6.
			 * Hypothesis font escalates from literal 12 px → density-text so
			 * it never reads smaller than the title at comfortable. max-w
			 * stays literal (PitchSelector overlay budget).
			 */
			{...clickableProps(
				onClick,
				"bg-[var(--surface-4)] rounded-[var(--r2)] p-[var(--density-card-pad)] flex flex-col gap-[var(--density-card-gap)] max-w-[320px]",
			)}
		>
			<span
				className="text-[length:var(--density-text)] font-medium truncate"
				aria-label={`Pitch: ${title}`}
			>
				{title}
			</span>
			<div className="flex items-center gap-[var(--density-gap)]">
				{kind && <Tag label={kind} />}
				<StatusChip status={betStatusToStatus(status)} />
			</div>
			<p className="text-[length:var(--density-text)] text-[var(--text-mid)] line-clamp-2">
				{hypothesis}
			</p>
			<span className="text-[12px]">{proposer}</span>
			<KeyValue label="Appetite" value={appetite} />
			{actions}
		</div>
	);
}
