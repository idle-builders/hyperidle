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
import { dsProps } from "./ds-attrs";

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
			{...dsProps("EmptyState", "2")}
			role="status"
			data-testid={dataTestId ?? "empty-state"}
			className="flex flex-col items-start gap-[4px] px-[8px] py-[24px] text-left"
		>
			<p className="text-[14px] font-medium text-[var(--text-hi)] leading-[1.4]">{title}</p>
			<p className="text-[12px] text-[var(--text-lo)] leading-[1.4]">{description}</p>
			{action && <div className="mt-[8px]">{action}</div>}
		</div>
	);
}
