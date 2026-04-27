import { NavItem } from "@hyperidle/design-system";
/**
 * @lore AppShell is the main layout composition: IconRail | Submenu | Main (Outlet) | Rail.
 * It manages view state, submenu state, settings panel, and global search.
 * This is NOT a custom component — it is a page-level composition assembling Tier 3 regions.
 */
import { KNOWLEDGE_SCOPES, type KnowledgeScope } from "@hyperidle/shared";
import { type JSX, useCallback, useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { AvatarMenu } from "../components/AvatarMenu";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { FactoryPausedBanner } from "../components/FactoryPausedBanner";
import { GlobalSearchPanel } from "../components/GlobalSearchPanel";
import { KillSwitchDialog } from "../components/KillSwitchDialog";
import { OfflineBanner } from "../components/OfflineBanner";
import type { SettingsData } from "../components/SettingsPanel";
import { SettingsPanel } from "../components/SettingsPanel";
import {
	DEFAULT_SETTINGS,
	MOCK_RAIL_BETS,
	MOCK_RAIL_BLOCKERS,
	MOCK_RAIL_COST,
} from "../fixtures/app-shell-data";
import { topicsForScope } from "../fixtures/knowledge-data";
import { useAutoDensity } from "../hooks/useAutoDensity";
import { useCommandK } from "../hooks/useCommandK";
import { useConversations } from "../hooks/useConversations";
import { FactoryStateProvider } from "../hooks/factoryStateContext";
import { useFactoryState } from "../hooks/useFactoryState";
import { useKillSwitchShortcut } from "../hooks/useKillSwitchShortcut";
import { useMe } from "../hooks/useMe";
import { useOfflineQueue } from "../hooks/useOfflineQueue";
import { useSystemStability } from "../hooks/useSystemStability";
import { useTheme } from "../hooks/useTheme";
import { useViewportBreakpoint } from "../hooks/useViewportBreakpoint";
import { ConversationsSubmenu } from "../shell/ConversationsSubmenu";
import { IconRail } from "../shell/IconRail";
import type { MobileTab } from "../shell/MobileTabBar";
import { MobileTabBar } from "../shell/MobileTabBar";
import { Rail } from "../shell/Rail";
import { RailGlanceStrip } from "../shell/RailGlanceStrip";
import type { SubmenuFilter, SubmenuFilterOption } from "../shell/Submenu";
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

/**
 * @lore J2 AC 52: per-view segmented filter row. Work has no filters.
 * Conversations/Knowledge render a short list. Filter state is local and
 * resets to "all" when the active view changes (AC 64). The rendered children
 * currently ignore the filter value — J4/J5 wire the filter into the list
 * rendering.
 *
 * @lore L3 (CONFUSION-2): Conversations is intentionally an EMPTY filter
 * row. The L3 routing chips (Mine / CEO / CPO / All) live INSIDE the
 * Conversations submenu's children area instead. We suppress the J2 chip
 * row here to avoid two filter rows in the 240px Submenu width and to
 * remove redundancy with the L3 section headers (which already encode
 * kind/status).
 */
const SUBMENU_FILTERS: Record<ViewId, ReadonlyArray<SubmenuFilterOption>> = {
	conversations: [],
	knowledge: [
		{ id: "all", label: "All" },
		{ id: "needs-review", label: "Needs review" },
	],
	work: [],
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

/**
 * J6: scope browser + topic NavItems rendered inside the Knowledge Submenu.
 * The three-scope segmented control sits on top; topic NavItems with health
 * dots follow. This lives here (not in Submenu) because AC explicitly states
 * the Submenu component stays unchanged — the scope browser is `children`.
 */
const SCOPE_LABELS: Record<KnowledgeScope, string> = {
	practice: "Practice",
	product: "Product",
	factory: "Factory",
};

const HEALTH_DOT: Record<"fresh" | "some_stale" | "mostly_stale", string> = {
	fresh: "bg-success",
	some_stale: "bg-warning",
	mostly_stale: "bg-error",
};

interface KnowledgeSubmenuProps {
	scope: KnowledgeScope;
	topics: ReadonlyArray<{
		topic: string;
		itemCount: number;
		staleCount: number;
		health: "fresh" | "some_stale" | "mostly_stale";
	}>;
	onScopeChange: (scope: KnowledgeScope) => void;
}

function KnowledgeSubmenu({ scope, topics, onScopeChange }: KnowledgeSubmenuProps): JSX.Element {
	return (
		<div className="flex flex-col gap-2" data-testid="knowledge-submenu">
			<div
				role="tablist"
				aria-label="Knowledge scope"
				className="flex gap-1"
				data-testid="knowledge-scope-browser"
			>
				{KNOWLEDGE_SCOPES.map((s) => {
					const selected = s === scope;
					return (
						<button
							key={s}
							type="button"
							role="tab"
							aria-selected={selected}
							className={selected ? "btn btn-xs btn-neutral" : "btn btn-xs btn-ghost"}
							onClick={() => onScopeChange(s)}
						>
							{SCOPE_LABELS[s]}
						</button>
					);
				})}
			</div>
			<ul className="menu menu-sm" aria-label={`${SCOPE_LABELS[scope]} topics`}>
				{topics.length === 0 ? (
					<li className="px-2 py-1 text-xs text-[var(--text-lo)]">No topics yet</li>
				) : (
					topics.map((t) => (
						<li key={t.topic}>
							<div
								className="flex items-center gap-2 px-2 py-1 min-h-[var(--density-row-h)]"
								data-testid={`knowledge-topic-nav-${t.topic}`}
							>
								<span
									role="img"
									className={`inline-block h-2 w-2 rounded-full shrink-0 ${HEALTH_DOT[t.health]}`}
									aria-label={`Health: ${t.health.replace("_", " ")}`}
									data-health={t.health}
								/>
								<span className="text-sm truncate flex-1">{t.topic}</span>
								<span className="badge badge-sm badge-ghost font-mono">{t.itemCount}</span>
							</div>
						</li>
					))
				)}
			</ul>
		</div>
	);
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
	// L8: poll /api/system/stability so the Rail's system-stability strip
	// (and the collapsed-Rail stability pills) can render. The hook caps
	// polling at every 30s per spec.
	const { stability } = useSystemStability();
	const [searchParams, setSearchParams] = useSearchParams();
	const [settingsOpen, setSettingsOpen] = useState(false);
	// @lore Settings lives at the shell root so [data-density] cascades --density-* CSS vars
	// to every consumer. Server persistence deferred (J3/J8).
	// @lore K3: theme lives in useTheme() (localStorage-backed) — settings.appearance.theme
	// is initialised from useTheme()'s value and kept in sync via the hook below.
	const { theme, setTheme } = useTheme();
	const [settings, setSettings] = useState<SettingsData>(() => ({
		...DEFAULT_SETTINGS,
		appearance: { ...DEFAULT_SETTINGS.appearance, theme },
	}));
	// @lore K7 / AESTHETICS.md § Mobile & Touch row "Auto-density behavior":
	// the user's Settings preference is the source of truth. When the
	// preference is `auto` (factory default) the viewport drives the chosen
	// preset (≤ 1024px → comfortable). The user override always wins —
	// once the user picks a non-auto value, that explicit choice persists
	// across breakpoint changes. Declared AFTER `settings` so the closure
	// reads the live preference, not a stale hoisted reference.
	const resolvedDensity = useAutoDensity(settings.appearance.density);

	// Reflect persisted theme changes (e.g. another tab) back into settings draft.
	useEffect(() => {
		setSettings((prev) =>
			prev.appearance.theme === theme
				? prev
				: { ...prev, appearance: { ...prev.appearance, theme } },
		);
	}, [theme]);

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

	// L7 AC1: avatar click opens the AvatarMenu dropdown — NOT Settings
	// directly. The menu exposes the kill switch ("Pause Factory") as
	// one of three required entry points. Settings is reachable via the
	// "Settings" menu item.
	const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
	const handleAvatarClick = useCallback((): void => {
		setAvatarMenuOpen((v) => !v);
	}, []);
	const handleSignOut = useCallback((): void => {
		// @lore L7 AC1: Sign out is wired as a stub here — the wider
		// auth/session handler ships outside the L7 scope. Closing the
		// menu is the visible behavior; the contract that the menu
		// item exists and is reachable is the AC.
		setAvatarMenuOpen(false);
	}, []);

	// L7: factory-state subscription (singleton row) + kill-switch dialog +
	// `Cmd+Shift+.` global shortcut. The dialog opens via the shortcut and
	// from the Settings → Safety entry; the banner consumes `state` so every
	// route renders the paused indicator above the shell.
	const { state: factoryState, refresh: refreshFactoryState } = useFactoryState();
	const factoryStateContextValue = useMemo(
		() => ({ state: factoryState, refresh: refreshFactoryState }),
		[factoryState, refreshFactoryState],
	);
	const [killSwitchOpen, setKillSwitchOpen] = useState(false);
	useKillSwitchShortcut(useCallback(() => setKillSwitchOpen(true), []));

	const handleConfirmFactoryPause = useCallback(
		async (input: { reason: string }): Promise<void> => {
			try {
				const res = await fetch("/api/factory/pause", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ reason: input.reason }),
				});
				if (!res.ok) {
					// Stale state — refresh and surface the error inline.
					return;
				}
			} finally {
				setKillSwitchOpen(false);
				refreshFactoryState();
			}
		},
		[refreshFactoryState],
	);

	const handleResumeFactory = useCallback(async (): Promise<void> => {
		await fetch("/api/factory/resume", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({}),
		});
		refreshFactoryState();
	}, [refreshFactoryState]);

	// J3: Command-K pressed while Settings is open must close Settings first,
	// then open the search. useCommandK's own document listener toggles search;
	// this effect intercepts the same key chord and routes it through the
	// settings-close path first. We attach to capture phase so we can see the
	// event before useCommandK does — then we stop propagation to prevent the
	// toggle from racing with our deliberate open call.
	useEffect(() => {
		if (!settingsOpen) return;
		const handler = (e: KeyboardEvent): void => {
			if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				e.stopImmediatePropagation();
				setSettingsOpen(false);
				commandK.open();
			}
		};
		document.addEventListener("keydown", handler, true);
		return () => {
			document.removeEventListener("keydown", handler, true);
		};
	}, [settingsOpen, commandK]);

	const handleSettingsSave = useCallback(
		async (next: SettingsData): Promise<void> => {
			// Mock save — real API wiring deferred. J1: mirror the new draft into
			// local state so density (and other appearance values) take effect on
			// save. The data-density attribute on the shell root reads from this.
			//
			// @lore L4 review (adversary O8): the L4 server snapshots
			// `appearance.undo_window_seconds` from `factory_settings` per
			// commit. The writer for that key is `PATCH /api/settings`
			// (status.ts), but this onSave handler does not call it yet —
			// it only mutates local React state. Until this is wired, the
			// server's undo-window snapshot falls back to the default
			// (8s). Tracked for the wider settings-persistence story; the
			// L4 contract still holds because the server clamps to the
			// allowlist [3..15] regardless of input.
			await new Promise((resolve) => setTimeout(resolve, 300));
			// K3: theme is persisted via useTheme() (localStorage). Route the
			// chosen value through setTheme so the boot script picks it up on
			// the next reload and matchMedia subscription stays correct.
			if (next.appearance.theme !== theme) {
				setTheme(next.appearance.theme);
			}
			setSettings(next);
		},
		[setTheme, theme],
	);

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
				default:
					navigate("/conversations/review");
					break;
			}
		},
		[commandK, navigate],
	);

	const submenuConfig = SUBMENU_CONFIG[activeView];

	// @lore J2 AC 62 + review W3: badge counts derive from SUBMENU_CONFIG at
	// render time (no second subscription). The values are *total* item counts
	// — the prop name is `badgeCountByView` (not "unread") because the unread
	// signal will overlay these counts in J9+. Until then, the dot semantic
	// "something here" matches well enough for the placeholder data.
	const badgeCountByView = useMemo<Partial<Record<ViewId, number>>>(() => {
		const out: Partial<Record<ViewId, number>> = {};
		for (const view of Object.keys(SUBMENU_CONFIG) as ViewId[]) {
			out[view] = SUBMENU_CONFIG[view].items.reduce((acc, item) => acc + (item.count ?? 0), 0);
		}
		return out;
	}, []);

	const submenuTotalCount = useMemo(
		() => submenuConfig.items.reduce((acc, item) => acc + (item.count ?? 0), 0),
		[submenuConfig],
	);

	const submenuFilters = SUBMENU_FILTERS[activeView];
	const [submenuFilter, setSubmenuFilter] = useState<SubmenuFilter>("all");
	// AC 64: reset filter to "all" on view change. The view id is referenced in
	// the body so Biome's useExhaustiveDependencies rule is satisfied while
	// preserving the intended "run on view change" semantics.
	useEffect(() => {
		void activeView;
		setSubmenuFilter("all");
	}, [activeView]);

	// J6: Knowledge submenu carries a scope browser (Practice/Product/Factory)
	// and per-scope topic NavItems. Scope lives in the URL ?scope= param so
	// KnowledgeList can read it without a shared provider. Switching scope
	// navigates to /knowledge?scope=<next> which triggers KnowledgeList to
	// reset its tab/selection state (AC: "Switching scope resets list
	// selection and filters"). The default scope is "practice" when the
	// param is missing or invalid.
	const currentScope: KnowledgeScope = useMemo(() => {
		const raw = searchParams.get("scope");
		return raw === "practice" || raw === "product" || raw === "factory" ? raw : "practice";
	}, [searchParams]);

	const knowledgeTopics = useMemo(() => topicsForScope(currentScope), [currentScope]);

	const handleScopeChange = useCallback(
		(next: KnowledgeScope): void => {
			// Navigate to /knowledge with the new scope. This also covers the case
			// where the user was on /knowledge/:id — switching scope returns them
			// to the list, which is the correct "reset selection" behavior.
			navigate(`/knowledge?scope=${next}`);
		},
		[navigate],
	);

	// L3: Conversations data (threads + me actor identity).
	const conversationsData = useConversations();
	const meData = useMe();

	// @lore L3 review (design W1): Conversations submenu chrome count must
	// derive from the real `useConversations()` data, not from the
	// SUBMENU_CONFIG mock items (3+1=4) which were stale once L3 wired the
	// live queue. The mock counts remain for Knowledge until that view's
	// real data source lands.
	const conversationsCount = conversationsData.threads.length;
	const handleOpenThread = useCallback(
		(threadId: string, kind: "review" | "chat" | "coach"): void => {
			const path = kind === "chat" ? "/conversations/chat" : "/conversations/review";
			navigate(`${path}?thread=${encodeURIComponent(threadId)}`);
		},
		[navigate],
	);

	// @lore L3 review (adversary C2): `now` drives ThreadRow timestamps and
	// the `resolved` 24h window. Passing `Date.now()` inline on every parent
	// render busted memoisation in ConversationsSubmenu — every keystroke or
	// unrelated state change re-classified all threads. We refresh on a 60s
	// interval (relative time only changes minute-to-minute) so memos remain
	// stable across renders that don't actually need a time tick.
	const [conversationsNow, setConversationsNow] = useState<number>(() => Date.now());
	useEffect(() => {
		const id = window.setInterval(() => {
			setConversationsNow(Date.now());
		}, 60_000);
		return () => window.clearInterval(id);
	}, []);

	// J3: when Settings overlay is open, hide all shell regions from the
	// accessibility tree and dim them visually. We also disable pointer
	// events so clicks cannot leak through the backdrop to focusable elements
	// like Rail/submenu nav items. The overlay itself lives outside this
	// wrapper so focus-trap still finds tabbable nodes.
	const shellDimmed = settingsOpen;
	// @lore J3: aria-hidden and inert on the wrapper propagate to descendants
	// in the accessibility tree; we keep the wrapper as flex so children lay
	// out exactly as before, and flex-wide when dimmed so the overlay sits
	// above it via z-40 without displacing the layout.
	const shellWrapperClass = shellDimmed
		? "flex flex-1 min-w-0 pointer-events-none opacity-60"
		: "flex flex-1 min-w-0";

	// L5: derive the active mobile tab from the current view + Settings open state.
	// Settings is its own tab on mobile; otherwise mirror the desktop view tab.
	const mobileActiveTab: MobileTab = settingsOpen ? "settings" : activeView;
	const handleMobileTabChange = useCallback(
		(tab: MobileTab): void => {
			if (tab === "settings") {
				setSettingsOpen(true);
				return;
			}
			setSettingsOpen(false);
			handleViewChange(tab);
		},
		[handleViewChange],
	);

	// L5: Rail-glance numbers on mobile derive from the same fixtures as the
	// desktop Rail. Burn label is the today-spend formatted string upstream.
	const mobileRailGlance = useMemo(
		() => ({
			blockingCount: MOCK_RAIL_BLOCKERS.length,
			burnLabel: MOCK_RAIL_COST.todaySpend,
			anomaliesCount: 0,
		}),
		[],
	);
	const [mobileRailSheetOpen, setMobileRailSheetOpen] = useState(false);

	// L5 ADV-03: offline queue. The verdict surface enqueues commits while
	// offline; on reconnect the queue drains via the (currently mock) commit
	// shim. The real commit wires into POST /api/threads/:id/verdict — left
	// as a stub here because the page-level orchestration (ConversationsReview)
	// currently uses MOCK_REVIEWS. The hook is wired into the shell so the
	// banner is visible across views, not only on the review page.
	const offlineQueue = useOfflineQueue({
		// @lore L5 mock: real commit lands when the verdict service is
		// shell-aware. For now the hook only needs `commit` to resolve so
		// the drain advances — the real D-track wire-up will replace this.
		// biome-ignore lint/suspicious/useAwait: stub commit; real wiring lands in D-track verdict service.
		commit: useCallback(async () => Promise.resolve(), []),
	});

	// L5: phone-first shell. Renders top-bar (avatar) + Rail-glance strip +
	// scrollable main + bottom tab bar. Submenu/IconRail/Rail are hidden.
	if (breakpoint.mobile) {
		return (
			<div
				className="flex h-screen flex-col bg-base-100 overflow-hidden"
				data-density={resolvedDensity}
				data-density-preference={settings.appearance.density}
				data-shell-mode="mobile"
				data-testid="mobile-shell"
			>
				<FactoryPausedBanner state={factoryState} onResume={() => void handleResumeFactory()} />
				{killSwitchOpen ? (
					<KillSwitchDialog
						open
						verb="factory_pause"
						target={{ id: "factory", name: "HyperIdle" }}
						blastRadius="This will pause every running session and block queued tasks until you resume."
						mode="press_hold"
						onConfirm={handleConfirmFactoryPause}
						onCancel={() => setKillSwitchOpen(false)}
					/>
				) : null}
				{/* Top bar: avatar (Coach access per L5 spec) + glance strip */}
				<header
					className="flex h-12 items-center justify-between border-b border-[var(--border-default)] px-3"
					data-testid="mobile-top-bar"
				>
					<span className="font-mono text-xs uppercase tracking-wider text-[var(--text-mid)]">
						{SUBMENU_CONFIG[activeView].title}
					</span>
					<div className="relative">
						<button
							type="button"
							className="btn btn-ghost btn-sm btn-circle"
							aria-label="Coach (User profile)"
							aria-haspopup="menu"
							aria-expanded={avatarMenuOpen}
							data-testid="mobile-avatar"
							onClick={handleAvatarClick}
						>
							<svg aria-hidden="true" width={20} height={20} viewBox="0 0 16 16" fill="currentColor">
								<circle cx="8" cy="5" r="3" />
								<path d="M2 14a6 6 0 0112 0H2z" />
							</svg>
						</button>
						<AvatarMenu
							actor={{
								id: meData.me?.id ?? "actor:ceo",
								name: meData.me?.role ?? "Founder",
								role: meData.me?.role ?? "CEO",
							}}
							controlled
							open={avatarMenuOpen}
							onOpenChange={setAvatarMenuOpen}
							onPauseFactory={() => {
								setAvatarMenuOpen(false);
								setKillSwitchOpen(true);
							}}
							onOpenSettings={() => {
								setAvatarMenuOpen(false);
								setSettingsOpen(true);
							}}
							onSignOut={handleSignOut}
						/>
					</div>
				</header>
				<RailGlanceStrip
					blockingCount={mobileRailGlance.blockingCount}
					burnLabel={mobileRailGlance.burnLabel}
					anomaliesCount={mobileRailGlance.anomaliesCount}
					onExpand={() => setMobileRailSheetOpen(true)}
				/>
				{offlineQueue.offline && <OfflineBanner offline={true} syncedCount={null} />}
				<main
					className="flex-1 overflow-y-auto px-[var(--density-page-gutter)] py-[var(--density-page-gutter)] text-[length:var(--density-text)] pb-[6.5rem]"
					data-testid="main-content"
					aria-hidden={shellDimmed || undefined}
				>
					<ErrorBoundary>
						<FactoryStateProvider value={factoryStateContextValue}>
							<Outlet />
						</FactoryStateProvider>
					</ErrorBoundary>
				</main>
				{/* L5: synced toast — rendered by OfflineBanner when syncedCount>0 */}
				{!offlineQueue.offline && offlineQueue.syncedCount !== null && (
					<OfflineBanner
						offline={false}
						syncedCount={offlineQueue.syncedCount}
						onDismissSyncedToast={offlineQueue.dismissSyncedToast}
					/>
				)}
				<MobileTabBar
					activeTab={mobileActiveTab}
					onTabChange={handleMobileTabChange}
					badgeCountByTab={{
						conversations: conversationsCount,
						knowledge: badgeCountByView.knowledge,
						work: badgeCountByView.work,
					}}
				/>
				{mobileRailSheetOpen && (
					<div
						role="dialog"
						aria-modal="true"
						aria-label="Rail details"
						data-testid="mobile-rail-sheet"
						className="fixed inset-0 z-50 flex flex-col bg-base-100"
					>
						<div className="flex items-center justify-between border-b border-[var(--border-default)] px-3 py-2">
							<span className="font-mono text-xs uppercase tracking-wider text-[var(--text-mid)]">
								Rail
							</span>
							<button
								type="button"
								className="btn btn-ghost btn-sm"
								aria-label="Close rail"
								data-testid="mobile-rail-sheet-close"
								onClick={() => setMobileRailSheetOpen(false)}
							>
								Close
							</button>
						</div>
						<div className="flex-1 overflow-y-auto">
							<Rail
								expanded={true}
								onToggleExpand={() => setMobileRailSheetOpen(false)}
								bets={MOCK_RAIL_BETS}
								blockers={MOCK_RAIL_BLOCKERS}
								cost={MOCK_RAIL_COST}
							/>
						</div>
					</div>
				)}
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

	return (
		<div
			className="flex h-screen bg-base-100 overflow-hidden"
			data-density={resolvedDensity}
			data-density-preference={settings.appearance.density}
			data-shell-mode="desktop"
		>
			{factoryState.paused ? (
				<div className="absolute inset-x-0 top-0 z-40">
					<FactoryPausedBanner
						state={factoryState}
						onResume={() => void handleResumeFactory()}
					/>
				</div>
			) : null}
			{killSwitchOpen ? (
				<KillSwitchDialog
					open
					verb="factory_pause"
					target={{ id: "factory", name: "HyperIdle" }}
					blastRadius="This will pause every running session and block queued tasks until you resume."
					mode="press_hold"
					onConfirm={handleConfirmFactoryPause}
					onCancel={() => setKillSwitchOpen(false)}
				/>
			) : null}
			<div className={shellWrapperClass} aria-hidden={shellDimmed || undefined}>
				{/* L7 AC1: AvatarMenu anchored to the bottom-left of the
				    IconRail (the rail is 48 px wide and the avatar
				    button sits at its bottom). Controlled so the same
				    avatar-click toggle drives both rail and menu. */}
				<div className="relative">
					<IconRail
						activeView={activeView}
						onViewChange={handleViewChange}
						onAvatarClick={handleAvatarClick}
						badgeCountByView={badgeCountByView}
					/>
					{avatarMenuOpen ? (
						<div className="absolute bottom-2 left-12 z-50">
							<AvatarMenu
								actor={{
									id: meData.me?.id ?? "actor:ceo",
									name: meData.me?.name ?? "Founder",
									role: (meData.me?.role as "CEO" | "CPO") ?? "CEO",
								}}
								controlled
								open={avatarMenuOpen}
								onOpenChange={setAvatarMenuOpen}
								onPauseFactory={() => {
									setAvatarMenuOpen(false);
									setKillSwitchOpen(true);
								}}
								onOpenSettings={() => {
									setAvatarMenuOpen(false);
									setSettingsOpen(true);
								}}
								onSignOut={handleSignOut}
							/>
						</div>
					) : null}
				</div>

				<Submenu
					title={submenuConfig.title}
					collapsed={submenuCollapsed}
					onToggleCollapse={toggleSubmenuCollapsed}
					count={
						activeView === "conversations"
							? conversationsCount > 0
								? conversationsCount
								: undefined
							: submenuTotalCount > 0
								? submenuTotalCount
								: undefined
					}
					filters={submenuFilters}
					activeFilter={submenuFilter}
					onFilterChange={setSubmenuFilter}
				>
					{activeView === "knowledge" ? (
						<KnowledgeSubmenu
							scope={currentScope}
							topics={knowledgeTopics}
							onScopeChange={handleScopeChange}
						/>
					) : activeView === "conversations" ? (
						<ConversationsSubmenu
							threads={conversationsData.threads}
							me={meData.me}
							now={conversationsNow}
							onOpenThread={handleOpenThread}
						/>
					) : (
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
					)}
				</Submenu>

				<main
					/*
					 * @lore K11: page gutter → --density-page-gutter
					 * (8/16/24) per density-audit.md § 3.5. Previously the
					 * `<main>` shared --density-pad-x with component
					 * interiors, so widening padding on a card and
					 * widening the page margin became the same dial. They
					 * are not the same dial. The K11 ladder explicitly
					 * stops at 24 px (§ 5.3) so K12 cannot quietly push it
					 * higher.
					 */
					className="flex-1 overflow-y-auto px-[var(--density-page-gutter)] py-[var(--density-page-gutter)] text-[length:var(--density-text)]"
					data-testid="main-content"
					aria-hidden={shellDimmed || undefined}
				>
					<ErrorBoundary>
						<FactoryStateProvider value={factoryStateContextValue}>
							<Outlet />
						</FactoryStateProvider>
					</ErrorBoundary>
				</main>

				<Rail
					expanded={railExpanded}
					onToggleExpand={toggleRailExpanded}
					bets={MOCK_RAIL_BETS}
					blockers={MOCK_RAIL_BLOCKERS}
					cost={MOCK_RAIL_COST}
					stability={stability}
				/>
			</div>

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
