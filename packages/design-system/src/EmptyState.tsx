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
			/*
			 * @lore K11: pad-x → --density-pad-x, pad-y → --density-card-pad
			 * (uses card budget so title↔description vertical breathing room
			 * scales with comfortable mode), gap → --density-card-gap, title
			 * → --density-text per density-audit.md § 3.2.7. Description font
			 * stays literal 12 px (deliberate de-emphasis). text-left is
			 * INTENTIONAL — must NOT switch to items-center under comfortable
			 * (#1 AI-aesthetic tell, see § 5.1).
			 */
			className="flex flex-col items-start gap-[var(--density-card-gap)] px-[var(--density-pad-x)] py-[var(--density-card-pad)] text-left"
		>
			<p className="text-[length:var(--density-text)] font-medium text-[var(--text-hi)] leading-[1.4]">
				{title}
			</p>
			<p className="text-[12px] text-[var(--text-lo)] leading-[1.4]">{description}</p>
			{/* @lore K11: action offset → --density-card-gap so the slot
			    breathes consistently with the title↔description rhythm. */}
			{action && <div className="mt-[var(--density-card-gap)]">{action}</div>}
		</div>
	);
}
