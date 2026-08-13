/**
 * PageHeader — Tier 1 DS component (AI7).
 *
 * Canonical page-header strip used across all 10 primary pages.
 * Encodes the one page-title treatment: 20px / 600 / tracking-[-0.01em].
 * Exports `pageTitleClassName` so pages that need an EDITABLE title input
 * can compose the exact treatment via a reference — not a literal fork.
 *
 * Scroll contract: renders a <header> with `shrink-0` so it stays pinned
 * wherever it is placed. The root scaffold (the `flex flex-col h-full` +
 * scroll-body contract this header pins against) is `PageScaffold`
 * (`./PageScaffold.tsx`, AZ2) — pass this component as its `header` prop.
 * `PageHeader` does not, and should not, own that root; a page composes both.
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
 * The primitive's own title heading uses this const (regardless of `level`).
 * KnowledgeCreate's editable <input> imports and composes it with additional
 * classes (no literal fork).
 *
 * @lore AI7: The class string is the single source of truth for the page-title
 * treatment. Any drift fails the PageHeader.test.tsx pin assertions loudly.
 */
export const pageTitleClassName =
	"text-[20px] font-[600] tracking-[-0.01em] text-[var(--text-primary)] min-w-0 truncate";

export interface PageHeaderProps {
	/**
	 * Page title. Rendered with the canonical title treatment; truncates on overflow.
	 * Tag is `<h1>` by default (see `level`).
	 */
	title: ReactNode;
	/**
	 * Heading level for the title's DOM tag: `<h1>` or `<h2>`. Default **1**.
	 *
	 * @lore AI7 (AMENDMENT — Phase-4 review): A page title is the top of the
	 * document outline, so the primitive's title must be the page's single `<h1>`
	 * by default. The earlier "always <h2>" rule broke two protected `level: 1`
	 * assertions (WorkRoutine.AA1:118, WorkProduct.test.tsx:121) and left migrated
	 * pages with no h1 (poor a11y outline). Default 1 = each primary page's
	 * PageHeader title is its single h1. Pass `level={2}` only for a sub-page
	 * whose title is NOT the document's top heading (none of the 10 migrated pages
	 * today). The class string (`pageTitleClassName`) is identical for both levels —
	 * ONLY the DOM tag changes, never the visual treatment (20px/600/-0.01em).
	 */
	level?: 1 | 2;
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
	level = 1,
	leading,
	subtitle,
	actions,
	"data-testid": testId,
}: PageHeaderProps): JSX.Element {
	const TitleTag = level === 2 ? "h2" : "h1";
	return (
		<header
			className="shrink-0 px-[24px] py-[18px] border-b border-[var(--border-subtle)]"
			{...dsProps("PageHeader", "1")}
			{...(testId ? { "data-testid": testId } : {})}
		>
			{leading && <div className="mb-[6px] min-w-0 overflow-hidden">{leading}</div>}

			<div className="flex items-center justify-between gap-[12px]">
				<TitleTag className={pageTitleClassName}>{title}</TitleTag>
				{actions && <div className="flex items-center gap-[9px] shrink-0">{actions}</div>}
			</div>

			{subtitle && (
				<div className="mt-[3px] text-[13px] text-[var(--text-tertiary)]">{subtitle}</div>
			)}
		</header>
	);
}
