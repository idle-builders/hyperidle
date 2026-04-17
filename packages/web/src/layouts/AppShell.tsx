/**
 * @lore AppShell is the main layout composition: IconRail | Submenu | Main (Outlet) | Rail.
 * It manages view state, submenu state, settings panel, and global search.
 * This is NOT a custom component — it is a page-level composition assembling Tier 3 regions.
 */
import { type JSX, useCallback, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { GlobalSearchPanel } from "../components/GlobalSearchPanel";
import { NavItem } from "../components/NavItem";
import type { SettingsData } from "../components/SettingsPanel";
import { SettingsPanel } from "../components/SettingsPanel";
import { useCommandK } from "../hooks/useCommandK";
import { IconRail } from "../shell/IconRail";
import { Rail } from "../shell/Rail";
import { Submenu } from "../shell/Submenu";
import type { ViewId } from "../shell/shell-types";

const DEFAULT_SETTINGS: SettingsData = {
	profile: { name: "Founder", email: "founder@hyperidle.com", avatarUrl: "" },
	products: [
		{ id: "p1", name: "Product Alpha", active: true },
		{ id: "p2", name: "Product Beta", active: false },
	],
	agents: [
		{ id: "a1", name: "Architect", autonomyLevel: "supervised", paused: false },
		{ id: "a2", name: "Developer", autonomyLevel: "autonomous", paused: false },
	],
	notifications: {
		reviewAlerts: true,
		costAlerts: true,
		blockerAlerts: true,
		quietHoursStart: "22:00",
		quietHoursEnd: "08:00",
		mutedProducts: [],
	},
	appearance: { density: "comfortable" },
};

const MOCK_RAIL_BETS = [
	{ id: "b1", title: "User auth flow", product: "Alpha", status: "active" as const },
	{ id: "b2", title: "Dashboard redesign", product: "Beta", status: "blocked" as const },
];

const MOCK_RAIL_BLOCKERS = [
	{ id: "bl1", agent: "Developer", reason: "Waiting for API spec", severity: "blocked" as const },
];

const MOCK_RAIL_COST = {
	todaySpend: "$12.40",
	todayBudget: "$50.00",
	weekSpend: "$84.20",
	weekBudget: "$350.00",
};

interface SubmenuConfig {
	title: string;
	items: Array<{ label: string; path: string; count?: number }>;
}

const SUBMENU_CONFIG: Record<ViewId, SubmenuConfig> = {
	conversations: {
		title: "Conversations",
		items: [
			{ label: "Review Queue", path: "/conversations/review", count: 3 },
			{ label: "Chat", path: "/conversations/chat", count: 1 },
		],
	},
	work: {
		title: "Work",
		items: [
			{ label: "Portfolio", path: "/work/portfolio" },
			{ label: "Team Board", path: "/work/team" },
		],
	},
	knowledge: {
		title: "Knowledge",
		items: [{ label: "All Items", path: "/knowledge", count: 12 }],
	},
};

function deriveViewFromPath(pathname: string): ViewId {
	if (pathname.startsWith("/work")) return "work";
	if (pathname.startsWith("/knowledge")) return "knowledge";
	return "conversations";
}

export function AppShell(): JSX.Element {
	const location = useLocation();
	const navigate = useNavigate();

	const activeView = useMemo(() => deriveViewFromPath(location.pathname), [location.pathname]);

	const [submenuCollapsed, setSubmenuCollapsed] = useState(false);
	const [railExpanded, setRailExpanded] = useState(true);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const commandK = useCommandK();

	const handleViewChange = useCallback(
		(view: ViewId): void => {
			const config = SUBMENU_CONFIG[view];
			if (config.items.length > 0) {
				navigate(config.items[0].path);
			}
		},
		[navigate],
	);

	const handleAvatarClick = useCallback((): void => {
		setSettingsOpen(true);
	}, []);

	const handleSettingsSave = useCallback(async (_settings: SettingsData): Promise<void> => {
		// Mock save — real API wiring deferred
		await new Promise((resolve) => setTimeout(resolve, 300));
	}, []);

	const handleSearchNavigate = useCallback(
		(_type: string, _id: string): void => {
			commandK.close();
			// Mock navigation — real routing deferred
			navigate("/conversations/review");
		},
		[commandK, navigate],
	);

	const submenuConfig = SUBMENU_CONFIG[activeView];

	return (
		<div className="flex h-screen bg-base-100 overflow-hidden">
			<IconRail
				activeView={activeView}
				onViewChange={handleViewChange}
				onAvatarClick={handleAvatarClick}
			/>

			<Submenu
				title={submenuConfig.title}
				collapsed={submenuCollapsed}
				onToggleCollapse={() => setSubmenuCollapsed((p) => !p)}
			>
				<ul className="menu menu-sm">
					{submenuConfig.items.map((item) => (
						<NavItem
							key={item.path}
							label={item.label}
							count={item.count}
							selected={location.pathname === item.path}
							onClick={() => navigate(item.path)}
						/>
					))}
				</ul>
			</Submenu>

			<main className="flex-1 overflow-y-auto p-3" data-testid="main-content">
				<Outlet />
			</main>

			<Rail
				expanded={railExpanded}
				onToggleExpand={() => setRailExpanded((p) => !p)}
				bets={MOCK_RAIL_BETS}
				blockers={MOCK_RAIL_BLOCKERS}
				cost={MOCK_RAIL_COST}
			/>

			<SettingsPanel
				open={settingsOpen}
				onClose={() => setSettingsOpen(false)}
				onSave={handleSettingsSave}
				settings={DEFAULT_SETTINGS}
			/>

			<GlobalSearchPanel
				open={commandK.isOpen}
				onClose={commandK.close}
				onNavigate={handleSearchNavigate}
			/>
		</div>
	);
}
