import type { JSX, ReactNode } from "react";
import { SearchField } from "../components/SearchField";

/**
 * Segmented-filter identifier for the Submenu header row.
 * J2: enumerates every filter any view currently offers. Views expose a
 * subset via the `filters` prop; `work` renders nothing.
 */
export type SubmenuFilter = "all" | "needs-review" | "chats" | "resolved";

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
	children,
}: SubmenuProps): JSX.Element {
	const hasSearch = searchValue !== undefined && onSearchChange !== undefined;
	const hasFilters = filters !== undefined && filters.length > 0;

	return (
		<div
			className={`flex flex-col gap-[var(--density-gap)] p-2 transition-[width] duration-200 ease-in-out ${collapsed ? "w-0 overflow-hidden" : "w-60"}`}
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
						 * @lore J2 review designer MED: at 240px Submenu width, four
						 * btn-xs filter chips overflow horizontally. flex-wrap lets
						 * them stack across two rows when needed.
						 */
						<div role="tablist" aria-label={`Filter ${title}`} className="flex flex-wrap gap-1">
							{filters.map((f) => {
								const selected = f.id === activeFilter;
								return (
									<button
										key={f.id}
										type="button"
										role="tab"
										aria-selected={selected}
										// @lore J2 review designer: btn-primary "shouted" over the
										// active view's edge indicator. btn-neutral keeps the
										// selected state legible without competing with primary
										// signal placement (active view, primary CTAs).
										className={selected ? "btn btn-xs btn-neutral" : "btn btn-xs btn-ghost"}
										onClick={() => onFilterChange?.(f.id)}
									>
										{f.label}
									</button>
								);
							})}
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
