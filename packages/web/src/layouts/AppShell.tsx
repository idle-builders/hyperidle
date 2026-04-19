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
import { useViewportBreakpoint } from "../hooks/useViewportBreakpoint";
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

/**
 * I4 security MED-1: validate a route-segment id coming from a search
 * result before interpolating it into a navigate() call. Rejects ids that
 * could escape the segment (contain `/`, `?`, `#`, `\`, `..`, whitespace,
 * control characters) or look like absolute URIs (scheme prefix). Returns
 * the URI-component-encoded safe id, or null if the input is unsafe. The
 * encode step preserves safety against characters that survive the reject
 * list (percent, etc.).
 *
 * @lore The search API emits ids from agent-produced or indexed content.
 * Even if today's mock returns safe ids, the trust boundary is "whatever
 * the /api/search endpoint emits" — which will be agent-authored strings
 * the moment live indexing lands.
 */
export function sanitizeRouteId(id: string): string | null {
	if (typeof id !== "string" || id.length === 0) return null;
	if (id.length > 200) return null;
	// Reject characters that escape the path segment or embed routing hints.
	if (/[/?#\\\s]/.test(id)) return null;
	// Reject control characters (C0 + DEL + C1).
	// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional — reject control chars
	if (/[\u0000-\u001f\u007f-\u009f]/.test(id)) return null;
	// Reject "..", ".", and leading dots (path traversal).
	if (id === "." || id === ".." || id.includes("..")) return null;
	// Reject scheme-like prefixes (http:, javascript:, data:, etc.).
	if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(id)) return null;
	return encodeURIComponent(id);
}

export function AppShell(): JSX.Element {
	const location = useLocation();
	const navigate = useNavigate();

	const activeView = useMemo(() => deriveViewFromPath(location.pathname), [location.pathname]);

	// I4 R1/R2 + Arch M4 / Adversary W3: the viewport breakpoint drives
	// Submenu/Rail collapse live. We track a per-axis manual override
	// (`null` = follow viewport, `true/false` = user has toggled) so that
	// the hook's resize/change listeners actually matter: if the user
	// hasn't overridden, resizing the window re-collapses/re-expands the
	// regions. Once the user toggles manually, their choice persists for
	// the session — including across subsequent resizes. The toggle
	// negates the *effective* visible state (override falls back to the
	// current viewport value), which is what the user expects.
	const breakpoint = useViewportBreakpoint();
	const [submenuOverride, setSubmenuOverride] = useState<boolean | null>(null);
	const [railOverride, setRailOverride] = useState<boolean | null>(null);
	const submenuCollapsed = submenuOverride ?? breakpoint.submenuCollapsed;
	const railExpanded = railOverride ?? breakpoint.railExpanded;
	const toggleSubmenuCollapsed = useCallback((): void => {
		setSubmenuOverride((prev) => !(prev ?? breakpoint.submenuCollapsed));
	}, [breakpoint.submenuCollapsed]);
	const toggleRailExpanded = useCallback((): void => {
		setRailOverride((prev) => !(prev ?? breakpoint.railExpanded));
	}, [breakpoint.railExpanded]);
	const [searchParams, setSearchParams] = useSearchParams();
	const [settingsOpen, setSettingsOpen] = useState(false);
	// J1: density lives at the shell root so CSS vars cascade to every
	// consumer. Read from `settings.appearance.density` — the shell's single
	// source of truth for settings. No server persistence yet — deferred (J3/J8).
	const [settings, setSettings] = useState<SettingsData>(DEFAULT_SETTINGS);
	const commandK = useCommandK();

	// Open settings panel when navigated to with ?settings=open query param.
	// Clear only the `settings` key so co-existing query params (e.g. filters)
	// are preserved.
	useEffect(() => {
		if (searchParams.get("settings") === "open") {
			setSettingsOpen(true);
			setSearchParams(
				(prev) => {
					const next = new URLSearchParams(prev);
					next.delete("settings");
					return next;
				},
				{ replace: true },
			);
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

	const handleSettingsSave = useCallback(async (next: SettingsData): Promise<void> => {
		// Mock save — real API wiring deferred. J1: mirror the new draft into
		// local state so density (and other appearance values) take effect on
		// save. The data-density attribute on the shell root reads from this.
		await new Promise((resolve) => setTimeout(resolve, 300));
		setSettings(next);
	}, []);

	const handleSearchNavigate = useCallback(
		(type: string, id: string): void => {
			commandK.close();
			// I4 N1: route by result type. The GlobalSearchPanel emits
			// "conversation" | "work" | "knowledge".
			switch (type) {
				case "work": {
					const safeId = sanitizeRouteId(id);
					if (safeId === null) return;
					navigate(`/work/bet/${safeId}`);
					break;
				}
				case "knowledge": {
					const safeId = sanitizeRouteId(id);
					if (safeId === null) return;
					navigate(`/knowledge/${safeId}`);
					break;
				}
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
		<div
			className="flex h-screen bg-base-100 overflow-hidden"
			data-density={settings.appearance.density}
		>
			<IconRail
				activeView={activeView}
				onViewChange={handleViewChange}
				onAvatarClick={handleAvatarClick}
			/>

			<Submenu
				title={submenuConfig.title}
				collapsed={submenuCollapsed}
				onToggleCollapse={toggleSubmenuCollapsed}
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

			<main
				className="flex-1 overflow-y-auto px-[var(--density-pad-x)] py-[var(--density-pad-y)] text-[length:var(--density-text)]"
				data-testid="main-content"
			>
				<ErrorBoundary>
					<Outlet />
				</ErrorBoundary>
			</main>

			<Rail
				expanded={railExpanded}
				onToggleExpand={toggleRailExpanded}
				bets={MOCK_RAIL_BETS}
				blockers={MOCK_RAIL_BLOCKERS}
				cost={MOCK_RAIL_COST}
			/>

			<SettingsPanel
				open={settingsOpen}
				onClose={() => setSettingsOpen(false)}
				onSave={handleSettingsSave}
				settings={settings}
			/>

			<GlobalSearchPanel
				open={commandK.isOpen}
				onClose={commandK.close}
				onNavigate={handleSearchNavigate}
			/>
		</div>
	);
}
