/**
 * Shared error-state region with a retry affordance.
 *
 * @lore J8 AC: an API failure must present a meaningful message plus a retry
 * button. This component is deliberately generic — pages pick the copy and
 * supply the retry handler. `role="alert"` is used so screen readers
 * announce the error on mount.
 */
import type { JSX } from "react";

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
			role="alert"
			data-testid={dataTestId ?? "error-state"}
			className="flex flex-col items-start gap-2 px-2 py-4 text-left"
		>
			<p className="text-sm font-medium text-error">{title}</p>
			<p className="text-xs text-[var(--text-lo)]">{description}</p>
			{onRetry && (
				<button
					type="button"
					className="btn btn-xs btn-primary"
					onClick={onRetry}
					data-testid="error-state-retry"
				>
					Retry
				</button>
			)}
		</div>
	);
}
