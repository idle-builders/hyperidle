import type { KnowledgeKind, KnowledgeLayer, KnowledgeStatus } from "@hyperidle/shared";
import type { JSX, ReactNode } from "react";
import { clickableProps } from "./clickable";
import { dsProps } from "./ds-attrs";
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
	/*
	 * @lore K11: retired the `factoryMode ? "py-[16px]" : "py-[8px]"` override
	 * from J7 per density-audit.md § 3.2.2. The factoryMode branch faked a
	 * "comfortable" scale by hardcoding 16 px. Now padding consumes
	 * --density-pad-y; factoryMode at comfortable would otherwise compound
	 * (32 px row pad). Title weight + font-heading remain factoryMode-driven
	 * — those are typographic chrome, not density. The KnowledgeRow.test.tsx
	 * J7 assertion that asserted `py-[16px]` was updated in lockstep.
	 */
	const titleClass = factoryMode
		? "text-[length:var(--density-text)] font-heading font-bold truncate"
		: "text-[length:var(--density-text)] truncate";
	const baseClassName = `flex items-center gap-[var(--density-gap)] px-[var(--density-pad-x)] py-[var(--density-pad-y)] rounded-[var(--r1)] hover:bg-[var(--surface-4)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)] focus-visible:-outline-offset-1 transition-colors duration-[var(--motion-fast)]`;
	/* clickableProps is spread without className — visual styles (hover, focus-
	   visible) live in baseClassName unconditionally, matching the HTML reference. */
	const { className: _clickableCls, ...interactiveProps } = clickableProps(onClick, baseClassName);
	return (
		<div
			{...dsProps("KnowledgeRow", "2")}
			className={onClick ? `${baseClassName} cursor-pointer` : baseClassName}
			{...interactiveProps}
		>
			<div className="flex-1 min-w-0">
				{/* @lore K11: inner-header gap → --density-gap per § 3.2.2. */}
				<div className="flex items-center gap-[var(--density-gap)]">
					<span className={titleClass} aria-label={`Knowledge: ${title}`}>
						{title}
					</span>
					<Tag label={layer} />
					<Tag label={kind} kind={kind as TagKind} />
					<StatusChip status={knowledgeStatusToStatus(status)} />
					{factoryMode && version && (
						<span
							/* @lore K7 / AESTHETICS.md § Spacing & Density row "Grid base unit" + § Typography
							   row "Body size (default)": px-[6px] → px-[8px] (off-grid), text-[10px] → text-[11px]
							   (off-scale). Tracking aligned to --tracking-caps via the recommendation row
							   "Letter-spacing for caps". */
							className="inline-flex items-center px-[8px] py-[2px] rounded-[var(--r-pill)] font-[var(--mono)] text-[11px] tracking-[var(--tracking-caps)] bg-[var(--surface-ghost)] text-[var(--text-lo)] shrink-0"
							data-testid="knowledge-version-pill"
						>
							{version}
						</span>
					)}
				</div>
				{caption && <p className="text-[12px] text-[var(--text-mid)] truncate">{caption}</p>}
			</div>
			<span className="text-[12px] text-[var(--text-lo)] whitespace-nowrap">{timestamp}</span>
			{actions}
		</div>
	);
}
