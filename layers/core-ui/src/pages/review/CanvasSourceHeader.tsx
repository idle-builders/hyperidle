// Canvases — shared source-attribution header.
//
// Founder feedback (human-design-review round 1): every canvas should make the
// SOURCE APP obvious at the top and offer a jump-off link back to the original
// record/ticket/PR/user in that tool ("Open in Stripe ↗"). The mini-logo alone
// wasn't enough — name the app + give the link.

import type { JSX, ReactNode } from "react";
import { isSafeSourceHref } from "./source-link-guard";
import { type ToolId, ToolLogo } from "./ToolLogo.js";

export interface CanvasSourceHeaderProps {
	readonly tool: ToolId | string;
	/** App display name, e.g. "Stripe", "Salesforce". */
	readonly app: string;
	/** The record identity in that tool, e.g. "Payment · INV-4471", "Opportunity · Northwind". */
	readonly record: string;
	/** Deep link back to the original record. Unsafe schemes are rendered as disabled text. */
	readonly href?: string;
	/** Optional trailing slot (standing, a count). */
	readonly trailing?: ReactNode;
}

/** Top strip: tool logo + app name + record identity + "Open in <app> ↗" jump-off. */
export function CanvasSourceHeader({
	tool,
	app,
	record,
	href = "#",
	trailing,
}: CanvasSourceHeaderProps): JSX.Element {
	const safe = isSafeSourceHref(href);
	const linkContent = (
		<>
			Open in {app}
			<span aria-hidden="true">↗</span>
		</>
	);
	return (
		<div className="border-width-thin-b flex items-center gap-[9px]  border-[var(--border-subtle)] px-[18px] py-[12px]">
			<ToolLogo tool={tool} size="md" label={app} />
			<div className="flex min-w-0 flex-1 items-baseline gap-[6px]">
				<span className="type-small   text-[var(--text-primary)]">{app}</span>
				<span className="text-[var(--text-tertiary)]">·</span>
				<span className="type-small truncate  text-[var(--text-secondary)]">{record}</span>
			</div>
			{trailing ? <div className="shrink-0">{trailing}</div> : null}
			{safe ? (
				<a
					href={href}
					target="_blank"
					rel="noopener noreferrer"
					className="type-control shrink-0 inline-flex items-center gap-[3px]   text-[var(--accent-deep)] hover:underline"
				>
					{linkContent}
				</a>
			) : (
				<span
					aria-disabled="true"
					className="type-metadata shrink-0 inline-flex items-center gap-[3px] rounded-[var(--r-pill)] px-[9px] py-[3px]   text-[var(--text-tertiary)]"
					title="Unsafe source link"
				>
					{linkContent}
				</span>
			)}
		</div>
	);
}
