import type { JSX, ReactNode } from "react";
import { SearchField } from "../components/SearchField";

export interface SubmenuProps {
	title: string;
	collapsed: boolean;
	onToggleCollapse: () => void;
	searchValue?: string;
	onSearchChange?: (value: string) => void;
	children: ReactNode;
}

export function Submenu({
	title,
	collapsed,
	onToggleCollapse,
	searchValue,
	onSearchChange,
	children,
}: SubmenuProps): JSX.Element {
	const hasSearch = searchValue !== undefined && onSearchChange !== undefined;

	return (
		<div
			className={`flex flex-col gap-1 p-2 ${collapsed ? "w-0 overflow-hidden" : "w-60"}`}
			onKeyDown={(e) => {
				if (e.key === "Escape" && !collapsed) {
					e.preventDefault();
					onToggleCollapse();
				}
			}}
		>
			<div className="flex items-center justify-between">
				<span className="font-heading text-xs uppercase tracking-wider text-[var(--text-lo)]">
					{title}
				</span>
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
					{hasSearch && (
						<SearchField
							value={searchValue}
							onChange={onSearchChange}
							placeholder={`Search ${title.toLowerCase()}...`}
						/>
					)}
					<div className="flex flex-col">{children}</div>
				</>
			)}
		</div>
	);
}
