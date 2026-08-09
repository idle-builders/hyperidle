/**
 * TabBar — Tier 0 foundation primitive.
 *
 * Pill variant: surface-container track with active pill.
 * Underline variant: border-bottom with active accent underline.
 *
 * @lore W2: No DaisyUI — custom CSS per TabBar.html.
 */

import type { JSX } from "react";
import { dsProps } from "./ds-attrs.js";

export interface TabBarProps {
	tabs: { id: string; label: string }[];
	activeId: string;
	onChange?: (id: string) => void;
	variant?: "pill" | "underline";
}

export function TabBar({ tabs, activeId, onChange, variant = "pill" }: TabBarProps): JSX.Element {
	if (variant === "underline") {
		return (
			<div
				{...dsProps("TabBar", "0")}
				className="flex items-end gap-[18px] border-b border-[var(--border-default)]"
				role="tablist"
			>
				{tabs.map((tab) => {
					const isActive = tab.id === activeId;
					return (
						<button
							key={tab.id}
							role="tab"
							type="button"
							aria-selected={isActive}
							onClick={() => onChange?.(tab.id)}
							className={[
								"pb-[6px] px-[9px] text-[13px] border-b-[2px] -mb-[1px]",
								"transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)]",
								"focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)]",
								isActive
									? "text-[var(--accent-deep)] font-semibold border-[var(--accent-deep)] bg-[var(--accent-primary-dim)]"
									: "text-[var(--text-tertiary)] font-medium border-transparent hover:text-[var(--text-secondary)]",
							].join(" ")}
						>
							{tab.label}
						</button>
					);
				})}
			</div>
		);
	}

	// pill variant
	return (
		<div
			{...dsProps("TabBar", "0")}
			className="inline-flex items-center bg-[var(--surface-container)] rounded-full p-[3px] gap-[3px]"
			role="tablist"
		>
			{tabs.map((tab) => {
				const isActive = tab.id === activeId;
				return (
					<button
						key={tab.id}
						role="tab"
						type="button"
						aria-selected={isActive}
						onClick={() => onChange?.(tab.id)}
						className={[
							"px-[12px] py-[6px] rounded-full text-[13px]",
							"transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)]",
							"focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)]",
							isActive
								? "bg-[var(--surface-elevated)] text-[var(--accent-deep)] font-semibold shadow-[var(--shadow-subtle)]"
								: "text-[var(--text-secondary)] font-medium hover:text-[var(--text-primary)]",
						].join(" ")}
					>
						{tab.label}
					</button>
				);
			})}
		</div>
	);
}
