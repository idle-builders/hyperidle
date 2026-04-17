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
		<div
			{...clickableProps(onClick)}
			className="border border-base-300 rounded p-2 flex flex-col gap-2"
		>
			<div className="flex items-center gap-2">
				<span className="text-sm font-medium" aria-label={`Pitch: ${title}`}>
					{title}
				</span>
				{kind && <Tag label={kind} />}
				<StatusChip status={betStatusToStatus(status)} />
			</div>
			<p className="text-xs text-base-content/60">{hypothesis}</p>
			<span className="text-xs">{proposer}</span>
			<KeyValue label="Appetite" value={appetite} />
			{actions}
		</div>
	);
}
