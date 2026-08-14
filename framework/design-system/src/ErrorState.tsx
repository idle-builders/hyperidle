/**
 * Shared error-state region with a retry affordance.
 *
 * @lore J8 AC: an API failure must present a meaningful message plus a retry
 * button. This component is deliberately generic — pages pick the copy and
 * supply the retry handler. `role="alert"` is used so screen readers
 * announce the error on mount.
 *
 * @lore visual-parity: matches ErrorState.html exactly — surface-elevated bg,
 * shadow-default, 36px padding, max-w 440px, 48x48 error icon with red-tinted
 * bg, 20px/600/text-primary title, 15px/text-secondary/1.7 description,
 * optional mono detail block, pill-shaped retry button.
 *
 * @lore AQ-001 hearth-internal-padding: retry button uses py-[10px] (optically
 * tuned vertical padding matching Button.html spec, same as Button primitive).
 */

// hearth-internal-padding
// py-[10px] on the retry button is AQ-001 exempt (optically tuned button vertical padding).

import type { JSX, ReactNode } from "react";
import { dsProps } from "./ds-attrs";

/** Pill-shaped primary button — matches Button.html "default" size spec exactly. */
const RETRY_BTN_CLASS =
	"inline-flex items-center justify-center px-[18px] py-[10px] text-[var(--text-on-accent)] bg-[var(--accent-primary)] rounded-[var(--r-pill)] border-[var(--bw-default)] border-transparent cursor-pointer hover:bg-[var(--accent-primary-hover)] active:scale-[0.97]";

/**
 * Compact retry pill — smaller than the full variant, inline-sized.
 *
 * @lore AI5 AQ-015: touch mechanism is `min-h-[44px] xl:min-h-[30px]`, NOT a
 * bare min-h. The 44px floor holds at every viewport up to and including
 * 1024px (where the K8 e2e gate measures); `xl:` (≥1280px) restores the
 * dense ~30px inline height so it reads as an inline control inside the
 * 18px-padded panel, not a floating slab. Mirrors `Select.tsx` `@lore AG5 fix-1`.
 */
const RETRY_BTN_COMPACT_CLASS =
	"inline-flex items-center justify-center px-[12px] py-[7px] min-h-[44px] xl:min-h-[30px] text-[var(--text-on-accent)] bg-[var(--accent-primary)] rounded-[var(--r-pill)] border-[var(--bw-default)] border-transparent cursor-pointer hover:bg-[var(--accent-primary-hover)] active:scale-[0.97]";

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
	 * @lore AI5: gives BlockRefEmbed's bare bordered error rows a primitive.
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
