import type { KnowledgeKind, KnowledgeLayer, KnowledgeStatus } from "@hyperidle/shared";
import type { JSX, ReactNode } from "react";
import { clickableProps } from "./clickable";
import { StatusChip } from "./StatusChip";
import { knowledgeStatusToStatus } from "./status-mapping";
import { Tag } from "./Tag";
import type { TagKind } from "./tag-kinds";

export interface KnowledgeRowProps {
	title: string;
	layer: KnowledgeLayer;
	kind: KnowledgeKind;
	status: KnowledgeStatus;
	timestamp: string;
	actions?: ReactNode;
	onClick?: () => void;
	caption?: string;
	/**
	 * J7 factory-scope treatment: taller row, Space-Grotesk-bold title, and a
	 * version pill. Additive — omitted or `false` yields byte-identical markup
	 * to the pre-J7 row (protected by KnowledgeRow.test.tsx).
	 *
	 * @lore J7: implemented as a single boolean toggle rather than branching
	 * into a second component to avoid duplicating the clickable / aria
	 * behaviour. Keep the toggle coarse — do not add more factory-only props.
	 */
	factoryMode?: boolean;
	/**
	 * Version string shown in a `badge badge-neutral` pill in factory mode.
	 * Ignored when `factoryMode` is false.
	 */
	version?: string;
}

export function KnowledgeRow({
	title,
	layer,
	kind,
	status,
	timestamp,
	actions,
	onClick,
	caption,
	factoryMode = false,
	version,
}: KnowledgeRowProps): JSX.Element {
	const padding = factoryMode ? "py-4" : "py-2";
	const titleClass = factoryMode ? "text-sm font-heading font-bold truncate" : "text-sm truncate";
	return (
		<div {...clickableProps(onClick, `flex items-center gap-2 px-2 ${padding}`)}>
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-2">
					<span className={titleClass} aria-label={`Knowledge: ${title}`}>
						{title}
					</span>
					<Tag label={layer} />
					<Tag label={kind} kind={kind as TagKind} />
					<StatusChip status={knowledgeStatusToStatus(status)} />
					{factoryMode && version && (
						<span
							className="badge badge-neutral badge-sm border-0"
							data-testid="knowledge-version-pill"
						>
							{version}
						</span>
					)}
				</div>
				{caption && <p className="text-xs text-[var(--text-mid)] truncate">{caption}</p>}
			</div>
			<span className="text-xs text-[var(--text-lo)] whitespace-nowrap">{timestamp}</span>
			{actions}
		</div>
	);
}
