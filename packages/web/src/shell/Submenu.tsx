import { dsShellProps, SearchField } from "@hyperidle/design-system";
import type { JSX, ReactNode } from "react";

/**
 * Segmented-filter identifier for the Submenu header row.
 * L10: vocabulary changed from J2's `[all, needs-review, chats, resolved]` to
 * `[all, blocking, async, needs-review]`. Conversations exposes
 * `[all, blocking, async]`; Knowledge exposes `[all, needs-review]`. Views
 * expose a subset via the `filters` prop; `work` renders nothing.
 */
export type SubmenuFilter = "all" | "blocking" | "async" | "needs-review";

export interface SubmenuFilterOption {
	id: SubmenuFilter;
	label: string;
}

export interface SubmenuProps {
	title: string;
	collapsed: boolean;
	onToggleCollapse: () => void;
	searchValue?: string;
	onSearchChange?: (value: string) => void;
	/** Total count rendered in the title bubble. Hidden when undefined. */
	count?: number;
	/** Available filter chips for this view. Omit or empty = no filter row. */
	filters?: ReadonlyArray<SubmenuFilterOption>;
	/** Currently selected filter id. Required when `filters` is non-empty. */
	activeFilter?: SubmenuFilter;
	/** Selection callback. Required when `filters` is non-empty. */
	onFilterChange?: (id: SubmenuFilter) => void;
	/**
	 * L10: optional handler for the inline `× Clear` affordance. When provided
	 * AND `activeFilter !== filters[0].id`, Submenu renders an inline clear
	 * button as a sibling of the tablist. When omitted or activeFilter is the
	 * default, the clear button is unmounted. Clicking it returns the filter
	 * to its default; the caller decides what "default" means.
	 */
	onClearFilter?: () => void;
	/**
	 * L10 / approved §5.5: when true, all chip controls + the clear button
	 * render with `aria-disabled="true"` + reduced opacity + no pointer events.
	 * The HTML `disabled` attribute is intentionally NOT set so screen readers
	 * still expose the button text.
	 */
	filtersDisabled?: boolean;
	children: ReactNode;
}

export function Submenu({
	title,
	collapsed,
	onToggleCollapse,
	searchValue,
	onSearchChange,
	count,
	filters,
	activeFilter,
	onFilterChange,
	onClearFilter,
	filtersDisabled = false,
	children,
}: SubmenuProps): JSX.Element {
	const hasSearch = searchValue !== undefined && onSearchChange !== undefined;
	const hasFilters = filters !== undefined && filters.length > 0;
	// L10 §3.2: "non-default" detection — filters[0] is the canonical default
	// chip (tablist convention). The clear affordance only mounts when the
	// caller passes a handler AND the active filter is not the default. No
	// magic strings — the default is whatever the caller put first.
	const defaultFilterId = hasFilters ? filters[0].id : undefined;
	const showClearButton =
		hasFilters &&
		onClearFilter !== undefined &&
		activeFilter !== undefined &&
		activeFilter !== defaultFilterId;
	// L10 / approved §5.5: aria-disabled + opacity-50 + pointer-events-none.
	// Intentionally NOT the HTML `disabled` attribute (preserves screen-reader
	// text); pointer-events-none also prevents click handlers from firing.
	const disabledClass = filtersDisabled ? "opacity-50 pointer-events-none" : "";

	// @lore Design system mandates GPU-only animations (transform, opacity). Width
	// transitions are not GPU-accelerated but are necessary here because the Submenu
	// collapse/expand changes the document flow — transform: scaleX() would clip
	// children and not reclaim layout space. transition-[width] is the pragmatic
	// choice for this expand/collapse pattern.
	return (
		<div
			{...dsShellProps("Submenu")}
			/*
			 * @lore K11: outer pad → --density-page-gutter per
			 * density-audit.md § 3.3.K2. Submenu width stays literal
			 * (`w-60`/240 px) — Linear/Atlassian/Notion all fix the
			 * secondary-nav width and only scale the row height; letting
			 * comfortable widen the Submenu would force `<main>` to reflow
			 * at every tier toggle.
			 */
			className={`flex flex-col gap-[var(--density-gap)] p-[var(--density-page-gutter)] transition-[width] duration-[var(--motion-medium)] ${collapsed ? "w-0 overflow-hidden" : "w-60"}`}
			onKeyDown={(e) => {
				if (e.key === "Escape" && !collapsed) {
					e.preventDefault();
					onToggleCollapse();
				}
			}}
		>
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					{/*
					 * @lore J2 AC 52: synthesis row 04 specifies a mono, uppercase,
					 * tracking-wider header (was `font-heading`). Count bubble appears
					 * only when `count` is provided.
					 */}
					<span className="font-mono text-xs uppercase tracking-wider text-[var(--text-lo)]">
						{title}
					</span>
					{count !== undefined && (
						<span className="badge badge-sm badge-ghost font-mono">{count}</span>
					)}
				</div>
				<button
					type="button"
					className="btn btn-ghost btn-xs"
					aria-label={collapsed ? "Expand section" : "Collapse section"}
					onClick={onToggleCollapse}
				>
					<svg aria-hidden="true" width={12} height={12} viewBox="0 0 12 12" fill="currentColor">
						{collapsed ? <path d="M4 2l5 4-5 4V2z" /> : <path d="M2 4l4 5 4-5H2z" />}
					</svg>
				</button>
			</div>

			{!collapsed && (
				<>
					{hasFilters && (
						/*
						 * @lore L10 §3.7 + Design C1: outer row holds the tablist and the
						 * optional inline `× Clear` button as siblings (NOT a tab inside
						 * the tablist — keeps the role contract clean). The inner tablist
						 * gets `flex-1 min-w-0` so `ml-auto` on the clear button actually
						 * pushes to the right edge (Arch W2) AND the four pills [All,
						 * Blocking, Async, × Clear] fit on a single row at the production
						 * Submenu width (w-60 = 240 px). Chips drop `min-w-[44px]` at `lg:`
						 * since the touch-target rule (AQ-015) only binds at viewport ≤
						 * 1024 px; at desktop tighter chips (px-2) keep the row coherent.
						 * We avoid `display: contents` (older WebKit a11y/SR bugs).
						 */
						<div className={`flex items-center gap-1 ${disabledClass}`}>
							<div
								role="tablist"
								aria-label={`Filter ${title}`}
								className="flex flex-1 min-w-0 flex-wrap gap-1"
							>
								{filters.map((f) => {
									const selected = f.id === activeFilter;
									return (
										<button
											key={f.id}
											type="button"
											role="tab"
											aria-selected={selected}
											aria-disabled={filtersDisabled || undefined}
											// @lore J2 review designer: btn-primary "shouted" over the
											// active view's edge indicator. btn-neutral keeps the
											// selected state legible without competing with primary
											// signal placement (active view, primary CTAs).
											className={`${selected ? "btn btn-xs btn-neutral" : "btn btn-xs btn-ghost"} h-auto min-h-[var(--density-row-h)] px-2 min-w-[44px] lg:min-w-0`}
											onClick={() => {
												// @lore L10 Adversary H1: pointer-events-none on the
												// parent blocks mouse activation but does NOT block
												// keyboard activation (Enter/Space). The runtime guard
												// is the only defense for keyboard users when disabled.
												if (filtersDisabled) return;
												onFilterChange?.(f.id);
											}}
										>
											{f.label}
										</button>
									);
								})}
							</div>
							{showClearButton && (
								<button
									type="button"
									className="btn btn-xs btn-ghost text-[var(--text-lo)] font-mono flex-shrink-0 h-auto min-h-[var(--density-row-h)] px-2 min-w-[44px] lg:min-w-0"
									aria-label="Clear filter"
									aria-disabled={filtersDisabled || undefined}
									data-testid="submenu-filter-clear"
									onClick={() => {
										if (filtersDisabled) return;
										onClearFilter?.();
									}}
								>
									× Clear
								</button>
							)}
						</div>
					)}
					{hasSearch && (
						<SearchField
							value={searchValue}
							onChange={onSearchChange}
							placeholder={`Search ${title.toLowerCase()}...`}
						/>
					)}
					<div className="flex flex-col px-[var(--density-pad-x)]">{children}</div>
				</>
			)}
		</div>
	);
}
