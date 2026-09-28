/**
 * Shared error-state region with a retry affordance.
 */

// hearth-internal-padding
// py-[10px] on the retry button is optically tuned vertical padding (same as Button).

import type { JSX, ReactNode } from "react";
import { dsProps } from "./ds-attrs";

/** Pill-shaped primary button, pill-radius, default size. */
const RETRY_BTN_CLASS =
	"inline-flex items-center justify-center px-[18px] py-[10px] text-[var(--text-on-accent)] bg-[var(--accent-primary)] rounded-[var(--r-pill)] border-width-default border-transparent cursor-pointer hover:bg-[var(--accent-primary-hover)] active:scale-[0.97]";

/**
 * Compact retry pill — smaller than the full variant, inline-sized.
 *
 * Touch target: min-h-[44px] holds through 1024px; xl:min-h-[30px] restores
 * dense inline height at ≥1280px so it reads as an inline control, not a floating slab.
 */
const RETRY_BTN_COMPACT_CLASS =
	"inline-flex items-center justify-center px-[12px] py-[7px] min-h-[44px] xl:min-h-[30px] text-[var(--text-on-accent)] bg-[var(--accent-primary)] rounded-[var(--r-pill)] border-width-default border-transparent cursor-pointer hover:bg-[var(--accent-primary-hover)] active:scale-[0.97]";

const DEFAULT_ERROR_ICON = (
	<svg
		width="24"
		height="24"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
		aria-hidden="true"
	>
		<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
		<line x1="12" y1="9" x2="12" y2="13" />
		<line x1="12" y1="17" x2="12.01" y2="17" />
	</svg>
);

export interface ErrorStateProps {
	title: string;
	description: string;
	/**
	 * Optional icon rendered in a 48x48 tinted container above the title.
	 * Defaults to a warning triangle SVG. Pass false to suppress the icon.
	 */
	icon?: ReactNode | false;
	/**
	 * Background color for the icon container.
	 * Defaults to status-error at 8% opacity (red tint).
	 */
	iconBg?: string;
	/**
	 * Optional technical detail string rendered in a monospace block
	 * below the description (e.g. "Error 502: upstream service unavailable").
	 */
	detail?: string;
	/** When provided, renders a primary pill-shaped Retry button. */
	onRetry?: () => void;
	/**
	 * Optional secondary action slot (e.g. "View status" link).
	 * Renders inline beside the retry button.
	 */
	action?: ReactNode;
	/**
	 * Compact (panel-inline) variant. When true: 18px padding, no max-width,
	 * surface-page (not elevated) + NO shadow (inline, not floating), never the
	 * 48px icon block, 15px/600 title, 13px desc, smaller retry pill with the
	 * AQ-015 touch mechanism, 12px mono detail block.
	 */
	compact?: boolean;
	/** data-testid passthrough so pages can scope E2E selectors. */
	dataTestId?: string;
}

export function ErrorState({
	title,
	description,
	icon,
	iconBg = "var(--status-error-dim)",
	detail,
	onRetry,
	action,
	compact = false,
	dataTestId,
}: ErrorStateProps): JSX.Element {
	const resolvedIcon = icon === false ? null : (icon ?? DEFAULT_ERROR_ICON);

	if (compact) {
		return (
			<div
				{...dsProps("ErrorState", "2")}
				role="alert"
				data-testid={dataTestId ?? "error-state"}
				// hearth-internal-padding
				className="bg-[var(--surface-page)] rounded-[var(--r-default)] p-[18px] text-left"
			>
				<p className="type-copy   text-[var(--text-primary)]   mb-[6px]">{title}</p>
				<p className="type-small  text-[var(--text-secondary)]  mb-[12px]">{description}</p>
				{detail && (
					<div className="type-data   text-[var(--text-tertiary)] bg-[var(--surface-container)] px-[12px] py-[9px] rounded-[var(--r-subtle)] mb-[12px] ">
						{detail}
					</div>
				)}
				{(onRetry || action) && (
					<div className="flex items-center gap-[9px]">
						{onRetry && (
							<button
								type="button"
								className={`type-control ${RETRY_BTN_COMPACT_CLASS}`}
								onClick={onRetry}
								data-testid="error-state-retry"
							>
								Retry
							</button>
						)}
						{action}
					</div>
				)}
			</div>
		);
	}

	return (
		<div
			{...dsProps("ErrorState", "2")}
			role="alert"
			data-testid={dataTestId ?? "error-state"}
			// hearth-internal-padding
			className="bg-[var(--surface-elevated)] rounded-[var(--r-default)] shadow-[var(--shadow-default)] p-[36px] max-w-[440px] text-left"
		>
			{resolvedIcon && (
				<div
					className="w-[48px] h-[48px] rounded-[var(--r-default)] flex items-center justify-center mb-[18px] text-[var(--status-error)]"
					style={{ background: iconBg }}
				>
					{resolvedIcon}
				</div>
			)}
			<p className="type-title   text-[var(--text-primary)]   mb-[9px]">{title}</p>
			<p className="type-copy  text-[var(--text-secondary)]  mb-[18px]">{description}</p>
			{detail && (
				<div className="type-data   text-[var(--text-tertiary)] bg-[var(--surface-page)] px-[12px] py-[9px] rounded-[var(--r-subtle)] mb-[18px] ">
					{detail}
				</div>
			)}
			{(onRetry || action) && (
				<div className="flex items-center gap-[9px]">
					{onRetry && (
						<button
							type="button"
							className={`type-control ${RETRY_BTN_CLASS}`}
							onClick={onRetry}
							data-testid="error-state-retry"
						>
							Retry
						</button>
					)}
					{action}
				</div>
			)}
		</div>
	);
}
