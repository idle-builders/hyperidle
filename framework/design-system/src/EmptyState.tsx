/**
 * Shared empty-state region.
 *
 * @lore J8 AC: empty-state copy must be meaningful, not blank. Pages pass a
 * concrete noun-forward title and a short agent-forward description so the
 * user knows what will eventually populate the list. Rendered with
 * `role="status"` so assistive tech reads the message without requiring a
 * route change.
 *
 * @lore visual-parity: matches EmptyState.html exactly — surface-page bg
 * (not elevated), 36px padding, no shadow, 20px/600 title, 15px/secondary
 * description, 48x48 icon container with tinted bg, pill action button.
 */
import type { JSX, ReactNode } from "react";
import { dsProps } from "./ds-attrs";

export interface EmptyStateProps {
	title: string;
	description: string;
	/**
	 * Optional icon rendered in a 48x48 tinted container above the title.
	 * Pass an SVG element (24px). When omitted, no icon container is rendered.
	 */
	icon?: ReactNode;
	/**
	 * Background color for the icon container.
	 * Defaults to accent-primary at 8% opacity (green tint).
	 */
	iconBg?: string;
	/**
	 * Optional action slot rendered below the description.
	 * Pass a button, link, or any interactive element.
	 */
	action?: ReactNode;
	/**
	 * Compact (panel-inline) variant. When true: 18px padding, no max-width,
	 * never renders the 48px icon block, 15px/600 title, 13px description.
	 * @lore AI5: embodies the hand-rolled panel one-liners
	 * (ArtifactThreadsSummary, SessionActivityPanel) so they have a primitive
	 * to reach for instead of forking. Default false keeps the full page-scale
	 * variant frozen by EmptyState.test.tsx.
	 */
	compact?: boolean;
	/** data-testid passthrough so pages can scope E2E selectors. */
	dataTestId?: string;
}

export function EmptyState({
	title,
	description,
	icon,
	iconBg = "var(--accent-primary-dim)",
	action,
	compact = false,
	dataTestId,
}: EmptyStateProps): JSX.Element {
	if (compact) {
		return (
			<div
				{...dsProps("EmptyState", "2")}
				role="status"
				data-testid={dataTestId ?? "empty-state"}
				// hearth-internal-padding
				className="bg-[var(--surface-page)] rounded-[var(--r-default)] p-[18px] text-left"
			>
				<p className="type-copy   text-[var(--text-primary)]   mb-[6px]">{title}</p>
				<p className="type-small  text-[var(--text-secondary)]  mb-[12px]">{description}</p>
				{action && <div>{action}</div>}
			</div>
		);
	}

	return (
		<div
			{...dsProps("EmptyState", "2")}
			role="status"
			data-testid={dataTestId ?? "empty-state"}
			// hearth-internal-padding
			className="bg-[var(--surface-page)] rounded-[var(--r-default)] p-[36px] max-w-[420px] text-left"
		>
			{icon && (
				<div
					className="w-[48px] h-[48px] rounded-[var(--r-default)] flex items-center justify-center mb-[18px] text-[var(--accent-deep)]"
					style={{ background: iconBg }}
				>
					{icon}
				</div>
			)}
			<p className="type-title   text-[var(--text-primary)]   mb-[9px]">{title}</p>
			<p className="type-copy  text-[var(--text-secondary)]  mb-[18px]">{description}</p>
			{action && <div>{action}</div>}
		</div>
	);
}
