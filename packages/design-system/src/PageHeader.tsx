/**
 * PageHeader — Tier 1 DS component (AI7).
 *
 * Canonical page-header strip used across all 10 primary pages.
 * Encodes the one page-title treatment: 20px / 600 / tracking-[-0.01em].
 * Exports `pageTitleClassName` so pages that need an EDITABLE title input
 * can compose the exact treatment via a reference — not a literal fork.
 *
 * Scroll contract: renders a <header> with `shrink-0` so the AppShell
 * pinned-header pattern (flex flex-col h-full → shrink-0 header +
 * flex-1 overflow-y-auto body) always works. The caller is responsible for
 * the `flex flex-col h-full` root scaffold.
 *
 * @lore AI7: tracking-[-0.01em] is negative-em — allowlisted by
 * design/no-hardcoded-tracking (which only forbids *positive-em* tracking
 * literals like tracking-[0.06em], requiring the token form there).
 * Negative-em kerning on the title has no token equivalent so the literal stays.
 *
 * @lore AI7 W1: pageTitleClassName is exported so KnowledgeCreate can compose
 * it on an <input> via `className={`${pageTitleClassName} …`}` — an identifier
 * expression, not the literal combo — so no-handrolled-page-header does not fire.
 */

// hearth-internal-padding
import type { JSX, ReactNode } from "react";
import { dsProps } from "./ds-attrs.js";

/**
 * Canonical page-title class string.
 * The primitive's own <h2> uses this const. KnowledgeCreate's editable <input>
 * imports and composes it with additional classes (no literal fork).
 *
 * @lore AI7: The class string is the single source of truth for the page-title
 * treatment. Any drift fails the PageHeader.test.tsx pin assertions loudly.
 */
export const pageTitleClassName =
	"text-[20px] font-[600] tracking-[-0.01em] text-[var(--text-primary)] min-w-0 truncate";

export interface PageHeaderProps {
	/** Page title. Rendered as <h2> with the canonical title treatment; truncates on overflow. */
	title: ReactNode;
	/** Orientation row above the title (Breadcrumb + NavHistoryCluster). Injected by the page. */
	leading?: ReactNode;
	/** Meta line below the title row (e.g. "Phase: build · Lead: Dana"). */
	subtitle?: ReactNode;
	/** Trailing cluster on the title row (StatusChip, Buttons). */
	actions?: ReactNode;
	/** Test hook passthrough on the <header>. */
	"data-testid"?: string;
}

export function PageHeader({
	title,
	leading,
	subtitle,
	actions,
	"data-testid": testId,
}: PageHeaderProps): JSX.Element {
	return (
		<header
			className="shrink-0 px-[24px] py-[18px] border-b border-[var(--border-subtle)]"
			{...dsProps("PageHeader", "1")}
			{...(testId ? { "data-testid": testId } : {})}
		>
			{leading && <div className="mb-[6px]">{leading}</div>}

			<div className="flex items-center justify-between gap-[12px]">
				<h2 className={pageTitleClassName}>{title}</h2>
				{actions && (
					<div className="flex items-center gap-[9px] shrink-0">{actions}</div>
				)}
			</div>

			{subtitle && <div className="mt-[3px] text-[13px] text-[var(--text-tertiary)]">{subtitle}</div>}
		</header>
	);
}
