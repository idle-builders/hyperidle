/**
 * Shared error-state region with a retry affordance.
 *
 * @lore J8 AC: an API failure must present a meaningful message plus a retry
 * button. This component is deliberately generic — pages pick the copy and
 * supply the retry handler. `role="alert"` is used so screen readers
 * announce the error on mount.
 */
import type { JSX } from "react";
import { dsProps } from "./ds-attrs";

export interface ErrorStateProps {
	title: string;
	description: string;
	/** When provided, renders a primary Retry button wired to the handler. */
	onRetry?: () => void;
	/** data-testid passthrough so pages can scope E2E selectors. */
	dataTestId?: string;
}

export function ErrorState({
	title,
	description,
	onRetry,
	dataTestId,
}: ErrorStateProps): JSX.Element {
	return (
		<div
			{...dsProps("ErrorState", "2")}
			role="alert"
			data-testid={dataTestId ?? "error-state"}
			/*
			 * @lore K11: pad-y → --density-card-pad, pad-x → --density-pad-x,
			 * gap → --density-card-gap, title → --density-text per
			 * density-audit.md § 3.2.8. Same shape as EmptyState. Retry
			 * button stays DaisyUI primitive (chip rule, see § 5.2);
			 * text-left is INTENTIONAL — see § 5.1.
			 */
			className="flex flex-col items-start gap-[var(--density-card-gap)] px-[var(--density-pad-x)] py-[var(--density-card-pad)] text-left bg-[var(--surface-elevated)] rounded-[var(--r-default)] shadow-[var(--shadow-subtle)]"
		>
			<p className="text-[length:var(--density-text)] font-medium text-[var(--status-error)] leading-[1.4]">
				{title}
			</p>
			<p className="text-[12px] text-[var(--text-tertiary)] leading-[1.4]">{description}</p>
			{onRetry && (
				<button
					type="button"
					/* @lore K7 / AESTHETICS.md § Spacing & Density row "Grid base unit": 4px hard rule.
					   px-[10px] → px-[8px] (10 was off-grid). Easing: --motion-ease (Material standard). */
					className="inline-flex items-center justify-center px-[8px] py-[4px] text-[12px] font-medium text-[var(--text-on-accent)] bg-[var(--accent-primary)] rounded-[var(--r-default)] cursor-pointer leading-[1.4] transition-opacity duration-[var(--motion-fast)] ease-[var(--motion-ease)] hover:opacity-85 active:opacity-70"
					onClick={onRetry}
					data-testid="error-state-retry"
				>
					Retry
				</button>
			)}
		</div>
	);
}
