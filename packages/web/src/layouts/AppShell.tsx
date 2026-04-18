/**
 * @lore AppShell is the main layout composition: IconRail | Submenu | Main (Outlet) | Rail.
 * It manages view state, submenu state, settings panel, and global search.
 * This is NOT a custom component — it is a page-level composition assembling Tier 3 regions.
 */
import { type JSX, useCallback, useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { GlobalSearchPanel } from "../components/GlobalSearchPanel";
import { NavItem } from "../components/NavItem";
import type { SettingsData } from "../components/SettingsPanel";
import { SettingsPanel } from "../components/SettingsPanel";
import {
	DEFAULT_SETTINGS,
	MOCK_RAIL_BETS,
	MOCK_RAIL_BLOCKERS,
	MOCK_RAIL_COST,
} from "../fixtures/app-shell-data";
import { useCommandK } from "../hooks/useCommandK";
import { IconRail } from "../shell/IconRail";
import { Rail } from "../shell/Rail";
import { Submenu } from "../shell/Submenu";
import type { ViewId } from "../shell/shell-types";

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
	const [searchParams, setSearchParams] = useSearchParams();
	const [settingsOpen, setSettingsOpen] = useState(false);
	const commandK = useCommandK();

	// Open settings panel when navigated to with ?settings=open query param
	useEffect(() => {
		if (searchParams.get("settings") === "open") {
			setSettingsOpen(true);
			setSearchParams({}, { replace: true });
		}
	}, [searchParams, setSearchParams]);

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
		(type: string, id: string): void => {
			commandK.close();
			// I4 N1: route by result type. The GlobalSearchPanel emits
			// "conversation" | "work" | "knowledge".
			switch (type) {
				case "work":
					navigate(`/work/bet/${id}`);
					break;
				case "knowledge":
					navigate(`/knowledge/${id}`);
					break;
				case "conversation":
				default:
					navigate("/conversations/review");
					break;
			}
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
				<ErrorBoundary>
					<Outlet />
				</ErrorBoundary>
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
