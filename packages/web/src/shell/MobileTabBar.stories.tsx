import type { JSX } from "react";
import { useState } from "react";
import type { MobileTab } from "./MobileTabBar";
import { MobileTabBar } from "./MobileTabBar";

export function MobileTabBarConversationsActive(): JSX.Element {
	const [tab, setTab] = useState<MobileTab>("conversations");
	return (
		<div className="relative h-32 w-[390px] border border-[var(--border-subtle)]">
			<MobileTabBar activeTab={tab} onTabChange={setTab} />
		</div>
	);
}

export function MobileTabBarWithBadges(): JSX.Element {
	const [tab, setTab] = useState<MobileTab>("work");
	return (
		<div className="relative h-32 w-[390px] border border-[var(--border-subtle)]">
			<MobileTabBar
				activeTab={tab}
				onTabChange={setTab}
				badgeCountByTab={{ conversations: 3, knowledge: 12 }}
			/>
		</div>
	);
}

export function MobileTabBarSettingsActive(): JSX.Element {
	const [tab, setTab] = useState<MobileTab>("settings");
	return (
		<div className="relative h-32 w-[390px] border border-[var(--border-subtle)]">
			<MobileTabBar activeTab={tab} onTabChange={setTab} />
		</div>
	);
}
