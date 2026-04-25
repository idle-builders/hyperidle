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
			className="flex flex-col items-start gap-[8px] px-[8px] py-[16px] text-left"
		>
			<p className="text-[14px] font-medium text-[var(--danger)] leading-[1.4]">{title}</p>
			<p className="text-[12px] text-[var(--text-lo)] leading-[1.4]">{description}</p>
			{onRetry && (
				<button
					type="button"
					className="inline-flex items-center justify-center px-[10px] py-[4px] text-[12px] font-medium text-[var(--surface-0)] bg-[var(--primary)] rounded-[var(--r2)] cursor-pointer leading-[1.4] transition-opacity duration-[var(--motion-fast)] ease-[ease] hover:opacity-85 active:opacity-70"
					onClick={onRetry}
					data-testid="error-state-retry"
				>
					Retry
				</button>
			)}
		</div>
	);
}
