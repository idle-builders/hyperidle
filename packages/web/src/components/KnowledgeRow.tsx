import type { KnowledgeKind, KnowledgeLayer, KnowledgeStatus } from "@hyperidle/shared";
import type { JSX, ReactNode } from "react";
import { StatusChip } from "./StatusChip";
import { Tag } from "./Tag";
import { clickableProps } from "./clickable";
import { knowledgeStatusToStatus } from "./status-mapping";

export interface KnowledgeRowProps {
	title: string;
	layer: KnowledgeLayer;
	kind: KnowledgeKind;
	status: KnowledgeStatus;
	timestamp: string;
	actions?: ReactNode;
	onClick?: () => void;
}

export function KnowledgeRow({
	title,
	layer,
	kind,
	status,
	timestamp,
	actions,
	onClick,
}: KnowledgeRowProps): JSX.Element {
	return (
		<div {...clickableProps(onClick)} className="flex items-center gap-2 px-2 py-2">
			<div className="flex-1 min-w-0 flex items-center gap-2">
				<span className="text-sm truncate">{title}</span>
				<Tag label={layer} />
				<Tag label={kind} />
				<StatusChip status={knowledgeStatusToStatus(status)} />
			</div>
			<span className="text-xs text-base-content/50 whitespace-nowrap">{timestamp}</span>
			{actions}
		</div>
	);
}
