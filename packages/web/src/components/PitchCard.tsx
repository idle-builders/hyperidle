// @lore PitchCard uses BetStatus because @hyperidle/shared has no PitchStatus type yet.
// Pitches and bets share a lifecycle in the current spec. If PitchStatus diverges,
// create a dedicated type and mapping function. See architecture review UI-20.
import type { BetStatus } from "@hyperidle/shared";
import type { JSX, ReactNode } from "react";
import { KeyValue } from "./KeyValue";
import { StatusChip } from "./StatusChip";
import { Tag } from "./Tag";
import { clickableProps } from "./clickable";
import { betStatusToStatus } from "./status-mapping";

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
		<div {...clickableProps(onClick, "bg-base-200 rounded p-2 flex flex-col gap-2")}>
			<div className="flex items-center gap-2">
				<span className="text-sm font-medium truncate" aria-label={`Pitch: ${title}`}>
					{title}
				</span>
				{kind && <Tag label={kind} />}
				<StatusChip status={betStatusToStatus(status)} />
			</div>
			<p className="text-xs text-[var(--text-mid)] line-clamp-2">{hypothesis}</p>
			<span className="text-xs">{proposer}</span>
			<KeyValue label="Appetite" value={appetite} />
			{actions}
		</div>
	);
}
