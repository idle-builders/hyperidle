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
	/** W3 AC-35: layer is optional — omit to hide the layer tag */
	layer?: KnowledgeLayer;
	kind: KnowledgeKind;
	status: KnowledgeStatus;
	timestamp: string;
	actions?: ReactNode;
	onClick?: () => void;
	caption?: string;
	/** W3 AC-35: preview text shown below title */
	preview?: string;
	/** id: allows caller to pass id without error */
	id?: string;
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
	preview,
}: KnowledgeRowProps): JSX.Element {
	// U8: font-heading removed (Hearth uses system-ui everywhere); factoryMode uses font-bold with default sans
	const titleClass = factoryMode ? "text-[15px] font-bold truncate" : "text-[15px] truncate";
	const baseClassName = `flex items-center gap-[12px] px-[24px] py-[12px] rounded-[var(--r-subtle)] hover:bg-[color-mix(in_oklab,var(--accent-primary)_4%,var(--surface-elevated))] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-primary)] focus-visible:-outline-offset-1 transition-colors duration-[var(--motion-fast)]`;
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
				<div className="flex items-center gap-[12px]">
					{/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-label provides "Knowledge: " context prefix for screen readers within the clickable row */}
					<span className={titleClass} aria-label={`Knowledge: ${title}`}>
						{title}
					</span>
					{layer && <Tag label={layer} />}
					<Tag label={kind} kind={kind as TagKind} />
					<StatusChip status={knowledgeStatusToStatus(status)} />
					{factoryMode && version && (
						<span
							/* @lore K7 / AESTHETICS.md § Spacing & Density row "Grid base unit" + § Typography
							   row "Body size (default)": px-[6px] → px-[8px] (off-grid), text-[10px] → text-[11px]
							   (off-scale). Tracking aligned to --tracking-caps via the recommendation row
							   "Letter-spacing for caps". */
							className="inline-flex items-center px-[9px] py-[3px] rounded-[var(--r-pill)] font-[family-name:var(--font-mono)] text-[11px] tracking-[var(--tracking-caps)] bg-[color-mix(in_oklab,var(--text-secondary)_8%,transparent)] text-[var(--text-tertiary)] shrink-0"
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
						className="flex items-center gap-[12px] text-[12px] text-[var(--text-tertiary)]"
					>
						<span>
							<span className="text-[var(--text-tertiary)] uppercase tracking-[var(--tracking-caps)]">
								recency
							</span>{" "}
							<span className="font-[var(--font-mono)] tabular-nums">{signals.recency ?? "—"}</span>
						</span>
						<span aria-hidden="true">·</span>
						<span>
							<span className="text-[var(--text-tertiary)] uppercase tracking-[var(--tracking-caps)]">
								freq
							</span>{" "}
							<span className="font-[var(--font-mono)] tabular-nums">
								{signals.frequency != null ? String(signals.frequency) : "—"}
							</span>
						</span>
						<span aria-hidden="true">·</span>
						<span>
							<span className="text-[var(--text-tertiary)] uppercase tracking-[var(--tracking-caps)]">
								impact
							</span>{" "}
							<span className="font-[var(--font-mono)] tabular-nums">
								{signals.citation != null ? String(signals.citation) : "—"}
							</span>
						</span>
					</div>
				) : (
					<>
						{caption && (
							<p className="text-[12px] text-[var(--text-secondary)] truncate">{caption}</p>
						)}
						{/* W3 AC-35: preview text shown below title */}
						{preview && !caption && (
							<p className="text-[12px] text-[var(--text-secondary)] truncate">{preview}</p>
						)}
					</>
				)}
			</div>
			<span className="text-[12px] text-[var(--text-tertiary)] whitespace-nowrap">{timestamp}</span>
			{actions}
		</div>
	);
}
