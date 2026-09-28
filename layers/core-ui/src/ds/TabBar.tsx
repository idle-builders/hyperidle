import type { JSX } from "react";
import { dsProps } from "./ds-attrs.js";

export interface TabBarProps {
	tabs: { id: string; label: string }[];
	activeId: string;
	onChange?: (id: string) => void;
	variant?: "pill" | "underline";
	/** Accessible name for the tablist — the label content doesn't say what the tabs switch between. */
	ariaLabel?: string;
	/** `data-testid` on the tablist wrapper, for callers with an existing test contract. */
	dataTestId?: string;
}

export function TabBar({
	tabs,
	activeId,
	onChange,
	variant = "pill",
	ariaLabel,
	dataTestId,
}: TabBarProps): JSX.Element {
	if (variant === "underline") {
		return (
			<div
				{...dsProps("TabBar", "0")}
				className="border-width-thin-b flex items-end gap-[18px]  border-[var(--border-default)]"
				role="tablist"
				aria-label={ariaLabel}
				data-testid={dataTestId}
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
							className={`type-control ${[
								"pb-[6px] px-[9px]   -mb-[1px]",
								"",
								"focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)]",
								isActive
									? "text-[var(--accent-deep)]  border-[var(--accent-deep)] bg-[var(--accent-primary-dim)]"
									: "text-[var(--text-tertiary)]  border-transparent hover:text-[var(--text-secondary)]",
							].join(" ")}`}
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
			className="inline-flex items-center bg-[var(--surface-container)] rounded-[var(--r-pill)] p-[3px] gap-[3px]"
			role="tablist"
			aria-label={ariaLabel}
			data-testid={dataTestId}
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
						className={`type-control ${[
							"px-[12px] py-[6px] rounded-[var(--r-pill)] ",
							"",
							"focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)]",
							isActive
								? "bg-[var(--surface-elevated)] text-[var(--accent-deep)]  shadow-[var(--shadow-subtle)]"
								: "text-[var(--text-secondary)]  hover:text-[var(--text-primary)]",
						].join(" ")}`}
					>
						{tab.label}
					</button>
				);
			})}
		</div>
	);
}
