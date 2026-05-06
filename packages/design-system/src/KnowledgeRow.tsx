import type { KnowledgeKind, KnowledgeLayer, KnowledgeStatus } from "@hyperidle/shared";
import type { JSX, ReactNode } from "react";
import { clickableProps } from "./clickable";
import { dsProps } from "./ds-attrs";
import { StatusChip } from "./StatusChip";
import { knowledgeStatusToStatus } from "./status-mapping";
import { Tag } from "./Tag";
import type { TagKind } from "./tag-kinds";

/**
 * L22 relevance signal triad shown on each row.
 * recency: relative time string ("2d ago") or null
 * frequency: 30-day access count or null
 * citation: citation count or null (always null in L22 — staged)
 */
export interface KnowledgeRowSignals {
	recency: string | null;
	frequency: number | null;
	citation: number | null;
}

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
	/**
	 * L22 relevance signal triad. When provided, suppresses the caption and
	 * renders a three-slot signal row: recency / freq / impact.
	 * Null slot values render as em dash (—).
	 *
	 * @lore L22: signals replace caption when present — they occupy the same
	 * sub-row slot but carry structured data. The em dash for absent signals
	 * avoids "0" which looks like real data (fake-zero guard, AC-8).
	 */
	signals?: KnowledgeRowSignals;
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
	signals,
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
			data-component="KnowledgeRow"
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
				{signals ? (
					// L22 signal triad: recency / freq / impact — em dash for absent values (AC-8)
					<div
						data-testid="knowledge-signals"
						className="flex items-center gap-[var(--density-gap)] text-[12px] text-[var(--text-lo)]"
					>
						<span>
							<span className="text-[var(--text-lo)] uppercase tracking-[var(--tracking-caps)]">
								recency
							</span>{" "}
							<span className="font-[var(--mono)] tabular-nums">{signals.recency ?? "—"}</span>
						</span>
						<span aria-hidden="true">·</span>
						<span>
							<span className="text-[var(--text-lo)] uppercase tracking-[var(--tracking-caps)]">
								freq
							</span>{" "}
							<span className="font-[var(--mono)] tabular-nums">
								{signals.frequency != null ? String(signals.frequency) : "—"}
							</span>
						</span>
						<span aria-hidden="true">·</span>
						<span>
							<span className="text-[var(--text-lo)] uppercase tracking-[var(--tracking-caps)]">
								impact
							</span>{" "}
							<span className="font-[var(--mono)] tabular-nums">
								{signals.citation != null ? String(signals.citation) : "—"}
							</span>
						</span>
					</div>
				) : (
					caption && <p className="text-[12px] text-[var(--text-mid)] truncate">{caption}</p>
				)}
			</div>
			<span className="text-[12px] text-[var(--text-lo)] whitespace-nowrap">{timestamp}</span>
			{actions}
		</div>
	);
}
