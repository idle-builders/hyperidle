import type { DocumentStatus } from "@hyperidle/domain-model";
import type { JSX, ReactNode } from "react";
import { clickableProps } from "./clickable";
import { dsProps } from "./ds-attrs";
import { StatusChip } from "./StatusChip";
import { documentStatusToStatus } from "./status-mapping";

/**
 * Relevance signal triad shown on each row.
 * recency: relative time string ("2d ago") or null
 * frequency: 30-day access count or null
 * citation: citation count or null
 */
export interface DocRowSignals {
	recency: string | null;
	frequency: number | null;
	citation: number | null;
}

export interface DocRowProps {
	title: string;
	status: DocumentStatus;
	timestamp: string;
	actions?: ReactNode;
	onClick?: () => void;
	caption?: string;
	preview?: string;
	/** id: allows caller to pass id without error */
	id?: string;
	// @lore: factoryMode — single boolean toggle not a second component; avoids duplicating clickable/aria behavior; keep coarse
	/**
	 * Taller row, bold title, and version pill in factory context.
	 */
	factoryMode?: boolean;
	/**
	 * Version string shown in a `badge badge-neutral` pill in factory mode.
	 * Ignored when `factoryMode` is false.
	 */
	version?: string;
	// @lore: signals vs caption — signals replace caption in same sub-row slot; em dash for absent values avoids "0" (fake-zero guard)
	/**
	 * Relevance signal triad. When provided, suppresses the caption.
	 * Null slot values render as em dash (—).
	 */
	signals?: DocRowSignals;
}

// @lore: DocRow name — DocumentRow is taken by the wire type in @hyperidle/domain-model; design-system row uses DocRow to avoid collision
export function DocRow({
	title,
	status,
	timestamp,
	actions,
	onClick,
	caption,
	factoryMode = false,
	version,
	signals,
	preview,
}: DocRowProps): JSX.Element {
	const titleClass = factoryMode ? "truncate" : "truncate";
	const baseClassName = `flex items-center gap-[12px] px-[24px] py-[12px] rounded-[var(--r-subtle)] hover:bg-[color-mix(in_oklab,var(--accent-primary)_4%,var(--surface-elevated))] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)] focus-visible:-outline-offset-1`;
	/* clickableProps is spread without className — visual styles (hover, focus-
	   visible) live in baseClassName unconditionally, matching the HTML reference. */
	const { className: _clickableCls, ...interactiveProps } = clickableProps(onClick, baseClassName);
	return (
		<div
			{...dsProps("DocRow", "2")}
			data-component="DocRow"
			className={onClick ? `${baseClassName} cursor-pointer` : baseClassName}
			{...interactiveProps}
		>
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-[12px]">
					<span data-testid="document-row-title" className={`type-copy ${titleClass}`}>
						{title}
					</span>
					<StatusChip status={documentStatusToStatus(status)} />
					{/* @lore: version pill — px-[9px] off AQ-001 grid; type-data for compact values; --tracking-caps for uppercase label */}
					{factoryMode && version && (
						<span
							className="type-data inline-flex items-center px-[9px] py-[3px] rounded-[var(--r-pill)]    bg-[color-mix(in_oklab,var(--text-secondary)_8%,transparent)] text-[var(--text-tertiary)] shrink-0"
							data-testid="document-version-pill"
						>
							{version}
						</span>
					)}
				</div>
				{signals ? (
					// recency / freq / impact — em dash for absent values
					<div
						data-testid="document-signals"
						className="type-metadata flex items-center gap-[12px]  text-[var(--text-tertiary)]"
					>
						<span>
							<span className="type-label text-[var(--text-tertiary)] uppercase ">recency</span>{" "}
							<span className="type-data  tabular-nums">{signals.recency ?? "—"}</span>
						</span>
						<span aria-hidden="true">·</span>
						<span>
							<span className="type-label text-[var(--text-tertiary)] uppercase ">freq</span>{" "}
							<span className="type-data  tabular-nums">
								{signals.frequency != null ? String(signals.frequency) : "—"}
							</span>
						</span>
						<span aria-hidden="true">·</span>
						<span>
							<span className="type-label text-[var(--text-tertiary)] uppercase ">impact</span>{" "}
							<span className="type-data  tabular-nums">
								{signals.citation != null ? String(signals.citation) : "—"}
							</span>
						</span>
					</div>
				) : (
					<>
						{caption && (
							<p className="type-metadata  text-[var(--text-secondary)] truncate">{caption}</p>
						)}
						{preview && !caption && (
							<p className="type-metadata  text-[var(--text-secondary)] truncate">{preview}</p>
						)}
					</>
				)}
			</div>
			<span className="type-metadata  text-[var(--text-tertiary)] whitespace-nowrap">
				{timestamp}
			</span>
			{actions}
		</div>
	);
}
