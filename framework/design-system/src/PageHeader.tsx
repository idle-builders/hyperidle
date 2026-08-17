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
import { PageFrame } from "./PageFrame.js";

/**
 * Canonical page-title class string.
 * The primitive's own title heading uses this const (regardless of `level`).
 * KnowledgeCreate's editable <input> imports and composes it with additional
 * classes (no literal fork).
 *
 * @lore AI7: The class string is the single source of truth for the page-title
 * treatment. Any drift fails the PageHeader.test.tsx pin assertions loudly.
 */
export const pageTitleClassName = "text-[var(--text-primary)] min-w-0 truncate";

export const paneTitleClassName = "text-[var(--text-primary)] min-w-0 truncate";

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
	/** Routed page header or local split-pane header. */
	presentation?: "page" | "pane";
	/** Semantic role for a pane title. Page titles always use `title`. */
	paneTitleProfile?: "lead" | "subheading";
	/** Reserve the destination pane's top-right SplitView controls. */
	reservePaneControls?: boolean;
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
	presentation = "page",
	paneTitleProfile = "lead",
	reservePaneControls = false,
	leading,
	subtitle,
	actions,
	"data-testid": testId,
}: PageHeaderProps): JSX.Element {
	const TitleTag = presentation === "pane" || level === 2 ? "h2" : "h1";
	const resolvedTitleProfile = presentation === "pane" ? paneTitleProfile : "title";
	const content = (
		<>
			{leading && <div className="mb-[6px] min-w-0 overflow-hidden">{leading}</div>}

			<div className="flex items-center justify-between gap-[12px]">
				<TitleTag
					data-az16-profile={resolvedTitleProfile}
					className={`${
						resolvedTitleProfile === "subheading"
							? "type-subheading"
							: resolvedTitleProfile === "lead"
								? "type-lead"
								: "type-title"
					} ${presentation === "pane" ? paneTitleClassName : `${pageTitleClassName} hidden md:block`}`}
				>
					{title}
				</TitleTag>
				{actions && <div className="flex items-center gap-[9px] shrink-0">{actions}</div>}
			</div>

			{subtitle && (
				<div data-az16-profile="small" className="type-small mt-[3px]  text-[var(--text-tertiary)]">
					{subtitle}
				</div>
			)}
		</>
	);
	return (
		<header
			data-az16-profile="thin"
			className={
				presentation === "pane"
					? `shrink-0 pl-[18px] ${reservePaneControls ? "pr-[84px]" : "pr-[18px]"} py-[12px] border-width-thin-b border-[var(--border-subtle)]`
					: "shrink-0 py-[18px] border-width-thin-b border-[var(--border-subtle)]"
			}
			{...dsProps("PageHeader", "1")}
			{...(testId ? { "data-testid": testId } : {})}
		>
			{presentation === "page" ? <PageFrame>{content}</PageFrame> : content}
		</header>
	);
}
