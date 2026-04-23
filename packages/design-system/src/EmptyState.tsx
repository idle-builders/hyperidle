/**
 * Shared empty-state region.
 *
 * @lore J8 AC: empty-state copy must be meaningful, not blank. Pages pass a
 * concrete noun-forward title and a short agent-forward description so the
 * user knows what will eventually populate the list. Rendered with
 * `role="status"` so assistive tech reads the message without requiring a
 * route change. Compact vertical rhythm matches the terminal-style aesthetic
 * (no oversized padding, no decorative icons).
 */
import type { JSX, ReactNode } from "react";

export interface EmptyStateProps {
	title: string;
	description: string;
	/** Optional action slot rendered below the description (e.g. a link). */
	action?: ReactNode;
	/** data-testid passthrough so pages can scope E2E selectors. */
	dataTestId?: string;
}

export function EmptyState({
	title,
	description,
	action,
	dataTestId,
}: EmptyStateProps): JSX.Element {
	return (
		<div
			role="status"
			data-testid={dataTestId ?? "empty-state"}
			className="flex flex-col items-start gap-1 px-2 py-6 text-left"
		>
			<p className="text-sm font-medium text-[var(--text-hi)]">{title}</p>
			<p className="text-xs text-[var(--text-lo)]">{description}</p>
			{action && <div className="mt-2">{action}</div>}
		</div>
	);
}
