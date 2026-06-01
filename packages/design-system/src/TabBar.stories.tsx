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
