import type { JSX, ReactNode } from "react";
import { dsProps } from "./ds-attrs";
import { type Status, StatusChip } from "./StatusChip";
import { Tag } from "./Tag";

export interface NotificationRowProps {
	severity: Status;
	message: string;
	timestamp: string;
	source?: string;
	actions?: ReactNode;
}

/**
 * Map Status severity to a CSS variable for the colored left border + icon circle.
 * @lore U8: NotificationRow gains a colored left border and icon circle per
 * Hearth design spec. The severity-to-color mapping uses semantic status tokens.
 */
function severityColor(severity: Status): string {
	switch (severity) {
		case "error":
			return "var(--status-error)";
		case "healthy":
			return "var(--status-success)";
		case "paused":
		case "behind":
			return "var(--status-warning)";
		default:
			return "var(--status-info)";
	}
}

export function NotificationRow({
	severity,
	message,
	timestamp,
	source,
	actions,
}: NotificationRowProps): JSX.Element {
	const color = severityColor(severity);
	return (
		<div
			{...dsProps("NotificationRow", "2")}
			/*
			 * @lore K11: pad/gap/body text consume density tokens per
			 * density-audit.md § 3.2.3. Same shape as ThreadRow but no
			 * avatar. Trailing timestamp stays literal 12 px (chrome).
			 * @lore U8: left colored border (3px) and icon circle added per Hearth restyle.
			 */
			className="flex items-center gap-[12px] py-[12px] px-[24px] rounded-[var(--r-subtle)] transition-colors duration-[var(--motion-fast)] hover:bg-[color-mix(in_oklab,var(--accent-primary)_4%,var(--surface-elevated))] border-l-[3px]"
			style={{ borderLeftColor: color }}
			data-testid="severity-border"
		>
			{/* Icon circle before StatusChip — 24px circle tinted with severity color */}
			<span
				data-testid="severity-icon-circle"
				aria-hidden="true"
				className="inline-flex w-[24px] h-[24px] rounded-full shrink-0 items-center justify-center"
				style={{ backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)` }}
			/>
			<StatusChip status={severity} />
			{/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-label provides "Notification: " context prefix for screen readers within the row */}
			<span className="flex-1 text-[15px] truncate" aria-label={`Notification: ${message}`}>
				{message}
			</span>
			{source && <Tag label={source} />}
			<span className="text-[12px] text-[var(--text-tertiary)] whitespace-nowrap">{timestamp}</span>
			{actions}
		</div>
	);
}
