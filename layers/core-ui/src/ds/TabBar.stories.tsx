/**
 * TabBar stories.
 */

import type { JSX } from "react";
import { TabBar } from "./TabBar.js";

export default { title: "TabBar" };

const TABS = [
	{ id: "overview", label: "Overview" },
	{ id: "activity", label: "Activity" },
	{ id: "settings", label: "Settings" },
];

export function PillVariant(): JSX.Element {
	return (
		<div className="p-[18px] flex flex-col gap-[12px]">
			<TabBar tabs={TABS} activeId="overview" variant="pill" />
			<TabBar tabs={TABS} activeId="activity" variant="pill" />
		</div>
	);
}

export function UnderlineVariant(): JSX.Element {
	return (
		<div className="p-[18px] flex flex-col gap-[12px]">
			<TabBar tabs={TABS} activeId="overview" variant="underline" />
			<TabBar tabs={TABS} activeId="activity" variant="underline" />
		</div>
	);
}

/**
 * AI6: Focus ring — 1px `focus-visible:outline-1` on each tab button (converged from 2px).
 * Also demonstrates hover-vs-selected independence: "Overview" is selected, "Activity" is hovered.
 * Use Tab key in the browser to see the 1px ring.
 */
export function FocusAndHoverVsSelected(): JSX.Element {
	return (
		<div className="p-[18px] flex flex-col gap-[18px]">
			<div>
				<p className="text-[11px] text-[var(--text-tertiary)] mb-[6px]">
					Pill — selected (Overview) vs hovered (another tab)
				</p>
				<TabBar tabs={TABS} activeId="overview" variant="pill" />
			</div>
			<div>
				<p className="text-[11px] text-[var(--text-tertiary)] mb-[6px]">
					Underline — selected (Activity) vs hovered (another tab)
				</p>
				<TabBar tabs={TABS} activeId="activity" variant="underline" />
			</div>
		</div>
	);
}
