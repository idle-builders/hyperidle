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
			{...clickableProps(
				onClick,
				"bg-[var(--surface-4)] rounded-[var(--r2)] p-[8px] flex flex-col gap-[4px] max-w-[320px]",
			)}
		>
			<span className="text-[14px] font-medium truncate" aria-label={`Pitch: ${title}`}>
				{title}
			</span>
			<div className="flex items-center gap-[8px]">
				{kind && <Tag label={kind} />}
				<StatusChip status={betStatusToStatus(status)} />
			</div>
			<p className="text-[12px] text-[var(--text-mid)] line-clamp-2">{hypothesis}</p>
			<span className="text-[12px]">{proposer}</span>
			<KeyValue label="Appetite" value={appetite} />
			{actions}
		</div>
	);
}
