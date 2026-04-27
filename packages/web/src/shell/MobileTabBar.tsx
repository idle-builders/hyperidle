import { dsShellProps } from "@hyperidle/design-system";
import { createElement, type JSX } from "react";
import { VIEW_ICONS } from "./shell-types";

/**
 * L5 — Bottom-tab nav for the mobile shell. Replaces IconRail+Submenu under
 * 768px. Renders 4 tabs: Conversations / Work / Knowledge / Settings.
 *
 * @lore L5 spec: "Bottom-tab nav uses `MobileTabBar` as a new component;
 * do not reuse `IconRail` rendered horizontally." — IconRail's vertical
 * roving-focus + brand-chrome chassis don't translate cleanly to a
 * horizontal bottom bar with a Settings tab; a dedicated component keeps
 * each shell's a11y semantics tight.
 *
 * @lore L5 AQ-015: every tab button is min 44×44px (h-12 = 48px). The
 * pill-shaped icon+label stack uses density-static spacing (this is
 * brand chrome; mobile chrome must not scale with comfortable density).
 */

export const MOBILE_TABS = ["conversations", "work", "knowledge", "settings"] as const;
export type MobileTab = (typeof MOBILE_TABS)[number];

export interface MobileTabBarProps {
	activeTab: MobileTab;
	onTabChange: (tab: MobileTab) => void;
	/** Per-tab notification badge counts. Missing or 0 → no dot. */
	badgeCountByTab?: Partial<Record<MobileTab, number>>;
}

const SETTINGS_ICON = createElement(
	"svg",
	{ width: 16, height: 16, viewBox: "0 0 16 16", fill: "currentColor", "aria-hidden": true },
	createElement("path", {
		d: "M8 5a3 3 0 100 6 3 3 0 000-6zm-1.5 9.5l.4-1.5a5 5 0 002.2 0l.4 1.5a1 1 0 00.97.75h1.06a1 1 0 001-1V13a5 5 0 001.55-1.55h1.25a1 1 0 001-1V9.4a1 1 0 00-.75-.97l-1.5-.4a5 5 0 000-2.2l1.5-.4a1 1 0 00.75-.97V3.4a1 1 0 00-1-1h-1.25A5 5 0 0013 .85V-.4a1 1 0 00-1-1H10.94a1 1 0 00-.97.75l-.4 1.5a5 5 0 00-2.2 0l-.4-1.5A1 1 0 006-.4H4.94a1 1 0 00-1 1V.85A5 5 0 002.4 2.4H1.15a1 1 0 00-1 1v1.25a1 1 0 00.75.97l1.5.4a5 5 0 000 2.2l-1.5.4a1 1 0 00-.75.97v1.06a1 1 0 001 1H2.4A5 5 0 003.85 13v1.25a1 1 0 001 1H6a1 1 0 00.5-.75z",
	}),
);

interface TabMeta {
	label: string;
	icon: JSX.Element;
}

const TAB_META: Record<MobileTab, TabMeta> = {
	conversations: {
		label: "Conversations",
		icon: VIEW_ICONS.conversations.icon as JSX.Element,
	},
	work: { label: "Work", icon: VIEW_ICONS.work.icon as JSX.Element },
	knowledge: { label: "Knowledge", icon: VIEW_ICONS.knowledge.icon as JSX.Element },
	settings: { label: "Settings", icon: SETTINGS_ICON },
};

function formatCount(n: number): string {
	return n > 99 ? "99+" : String(n);
}

export function MobileTabBar({
	activeTab,
	onTabChange,
	badgeCountByTab,
}: MobileTabBarProps): JSX.Element {
	return (
		<nav
			{...dsShellProps("MobileTabBar")}
			aria-label="Primary"
			data-testid="mobile-tab-bar"
			className="fixed bottom-0 left-0 right-0 z-30 flex h-14 items-stretch border-t border-[var(--border-default)] bg-[var(--surface-1)]"
		>
			{MOBILE_TABS.map((tab) => {
				const isActive = tab === activeTab;
				const meta = TAB_META[tab];
				const count = badgeCountByTab?.[tab] ?? 0;
				const showDot = !isActive && count > 0;
				const ariaLabel = showDot
					? `${meta.label} - ${formatCount(count)} ${count === 1 ? "item" : "items"}`
					: meta.label;
				return (
					<button
						key={tab}
						type="button"
						aria-label={ariaLabel}
						aria-current={isActive ? "page" : undefined}
						data-testid={`mobile-tab-${tab}`}
						onClick={() => onTabChange(tab)}
						className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 min-h-[44px] min-w-[44px] text-[11px] ${isActive ? "text-[var(--text-hi)]" : "text-[var(--text-mid)]"}`}
					>
						<span aria-hidden="true" className="flex items-center justify-center">
							{meta.icon}
						</span>
						<span className="leading-none">{meta.label}</span>
						{showDot && (
							<span
								aria-hidden="true"
								className="absolute top-1 right-[calc(50%-14px)] h-1.5 w-1.5 rounded-full bg-error"
							/>
						)}
						{isActive && (
							<span
								aria-hidden="true"
								className="absolute top-0 left-1/4 right-1/4 h-0.5 bg-[var(--primary)]"
							/>
						)}
					</button>
				);
			})}
		</nav>
	);
}
