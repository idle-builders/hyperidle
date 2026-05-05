import { NavItem } from "@hyperidle/design-system";
/**
 * @lore AppShell is the main layout composition: IconRail | Submenu | Main (Outlet) | Rail.
 * It manages view state, submenu state, settings panel, and global search.
 * This is NOT a custom component — it is a page-level composition assembling Tier 3 regions.
 */
import { KNOWLEDGE_SCOPES, type KnowledgeScope } from "@hyperidle/shared";
import { type JSX, useCallback, useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { GlobalSearchPanel } from "../components/GlobalSearchPanel";
import type { SettingsData } from "../components/SettingsPanel";
import { SettingsPanel } from "../components/SettingsPanel";
import type { ConversationsFilter } from "../components/ThreadSections";
import { predicateFor, ThreadSections } from "../components/ThreadSections";
import {
	DEFAULT_SETTINGS,
	MOCK_RAIL_BETS,
	MOCK_RAIL_BLOCKERS,
	MOCK_RAIL_COST,
} from "../fixtures/app-shell-data";
import { topicsForScope } from "../fixtures/knowledge-data";
import { useAutoDensity } from "../hooks/useAutoDensity";
import { useCommandK } from "../hooks/useCommandK";
import { useConversationsThreads } from "../hooks/useConversationsThreads";
import { useTheme } from "../hooks/useTheme";
import { useViewportBreakpoint } from "../hooks/useViewportBreakpoint";
import { IconRail } from "../shell/IconRail";
import { Rail } from "../shell/Rail";
import type { SubmenuFilter, SubmenuFilterOption } from "../shell/Submenu";
import { Submenu } from "../shell/Submenu";
import type { ViewId } from "../shell/shell-types";
import { ToastRegion } from "../shell/ToastRegion";

/**
 * Outlet context surfaced by AppShell to its children. Read by
 * `ConversationsReview` (and any future thread-aware page) via
 * `useOutletContext<AppShellOutletContext>()`.
 */
export interface AppShellOutletContext {
	selectedThreadId: string | null;
}

interface SubmenuConfig {
	title: string;
	items: Array<{ label: string; path: string; count?: number }>;
}

const SUBMENU_CONFIG: Record<ViewId, SubmenuConfig> = {
	// L8: the conversations submenu is now driven by the live thread list
	// (`useConversationsThreads`). The static Review Queue / Chat entries +
	// hardcoded counts are removed per TRACK-L L8 ACs.
	conversations: {
		title: "Conversations",
		items: [],
	},
	// L13: "Team Board" entry removed. Portfolio is the single Work landing;
	// product pages are reached via drill-down, not a submenu tree.
	work: {
		title: "Work",
		items: [{ label: "Portfolio", path: "/work/portfolio" }],
	},
	knowledge: {
		title: "Knowledge",
		items: [{ label: "All Items", path: "/knowledge", count: 12 }],
	},
};

/**
 * @lore J2 AC 52 / L10: per-view segmented filter row. Work has no filters.
 * Conversations exposes `[All, Blocking, Async]` (L10 — the chip vocabulary
 * IS the blocking-vs-async axis); Knowledge keeps `[All, Needs review]`.
 * Filter state is local to AppShell and resets to "all" when the active view
 * changes (AC 64).
 */
const SUBMENU_FILTERS: Record<ViewId, ReadonlyArray<SubmenuFilterOption>> = {
	conversations: [
		{ id: "all", label: "All" },
		{ id: "blocking", label: "Blocking" },
		{ id: "async", label: "Async" },
	],
	knowledge: [
		{ id: "all", label: "All" },
		{ id: "needs-review", label: "Needs review" },
	],
	work: [],
};

/** @lore L8: demo seed founder id; replaced with auth-context user id once auth lands. */
const DEMO_FOUNDER_ID = "u-founder";

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
			// L9: conversations navigates to the canonical queue route.
			if (view === "conversations") {
				navigate("/conversations");
				return;
			}
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
				case "conversation": {
					// L9: GlobalSearchPanel emits the thread id as `id`; route to
					// the canonical detail URL when the id is safe (arch-critique
					// SUGGESTION #4: verify the search result carries an id and wire
					// /conversations/:id rather than /conversations).
					const safeId = sanitizeRouteId(id);
					if (safeId !== null) {
						navigate(`/conversations/${safeId}`);
					} else {
						navigate("/conversations");
					}
					break;
				}
				default:
					navigate("/conversations");
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

	// L8 §3.6: live thread list for the Conversations Submenu (declared
	// before submenuTotalCount + selectedThreadId because both reference it).
	// @lore L8: participant id is hardcoded to the demo seed founder until
	// real auth lands. Replace with the auth-context user id when that story
	// ships; this is the single call site.
	const conversationsThreads = useConversationsThreads(DEMO_FOUNDER_ID);

	const submenuFilters = SUBMENU_FILTERS[activeView];
	const [submenuFilter, setSubmenuFilter] = useState<SubmenuFilter>("all");
	// Narrow the wider `SubmenuFilter` union to the closed `ConversationsFilter`
	// subset for the Conversations view. Any id outside the subset (e.g.
	// `'needs-review'`) is coerced to `'all'`; the view-change effect below
	// resets to `'all'` so this branch is only a forwards-compatible guard
	// against future shared filter state (e.g. URL-restored values).
	const conversationsFilter: ConversationsFilter =
		submenuFilter === "blocking" || submenuFilter === "async" ? submenuFilter : "all";
	const submenuTotalCount = useMemo(() => {
		// L8: conversations count derives from the live thread list (never a
		// literal). L10 T8: the count is POST-filter so it cannot drift from
		// the rendered list — both consume the same `predicateFor()`.
		// @lore L10: the L8 contract for the badge changes from "total threads"
		// to "post-filter threads". This is intentional (approved §6) — when a
		// chip narrows the list, the badge reflects what the user is actually
		// looking at.
		if (activeView === "conversations") {
			return conversationsThreads.threads.filter(predicateFor(conversationsFilter)).length;
		}
		return submenuConfig.items.reduce((acc, item) => acc + (item.count ?? 0), 0);
	}, [activeView, conversationsThreads.threads, submenuConfig, conversationsFilter]);
	const handleClearFilter = useCallback((): void => {
		setSubmenuFilter("all");
	}, []);
	// L10 / approved §5.5 + plan T10: chips inert during the threads-fetch
	// error state. Only the conversations submenu carries this signal —
	// other views ignore it (they don't fetch threads).
	// @lore L10 Arch W3: `Submenu` consumes `filtersDisabled` unconditionally,
	// but it is only meaningful for the Conversations view (the only view that
	// fetches threads). For non-conversations views the prop is always false
	// and the chips remain interactive — this is intentional view-gating.
	const filtersDisabled = activeView === "conversations" && conversationsThreads.status === "error";
	// L10 Adversary H2 / Slop H3: hide the count badge unless the conversations
	// fetch has resolved to ready. During loading/error we have no authoritative
	// count, so showing `0` under a non-default filter would falsely imply "this
	// filter has zero matches" when in fact the data has not arrived. For
	// non-conversations views the count is a static sum and is always trusted.
	const submenuBadgeCount: number | undefined = (() => {
		if (activeView !== "conversations") {
			return submenuTotalCount > 0 ? submenuTotalCount : undefined;
		}
		if (conversationsThreads.status !== "ready") return undefined;
		// L10 §1 Q9: under a non-default filter, `0` is informative — "this
		// filter has no matches right now". Under `'all'`, fall back to the
		// L8 zero-hide contract.
		if (conversationsFilter !== "all") return submenuTotalCount;
		return submenuTotalCount > 0 ? submenuTotalCount : undefined;
	})();
	// L9: the selected thread id is now authoritative from the URL path param.
	// useParams() inside the layout receives the merged child route params via
	// React Router v7's param-merge behavior — when mounted at
	// /conversations/:threadId, `threadId` is the segment value; at
	// /conversations (no segment), it is undefined.
	// @lore L9 WARNING (arch-critique): keeping selectedThreadId in the Outlet
	// context for backwards-compat with any consumer added between L8 and L9
	// (AppShell.threads.test.tsx line 86 reads it via useOutletContext). The
	// field is now derived from the URL rather than a useState, so it is always
	// in sync with the browser location.
	const { threadId: urlThreadId } = useParams<{ threadId?: string }>();
	const selectedThreadId = urlThreadId ?? null;
	const handleSelectThread = useCallback(
		(id: string): void => {
			// L9 D5: clicking a thread row navigates to the canonical detail URL.
			// The URL becomes the source of truth for selection; the Outlet context
			// field selectedThreadId is derived from it (above) for backwards-compat.
			navigate(`/conversations/${encodeURIComponent(id)}`);
		},
		[navigate],
	);
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

	return (
		<ToastRegion>
			<div
				className="flex h-screen bg-base-100 overflow-hidden"
				data-density={resolvedDensity}
				data-density-preference={settings.appearance.density}
			>
				<div className={shellWrapperClass} aria-hidden={shellDimmed || undefined}>
					<IconRail
						activeView={activeView}
						onViewChange={handleViewChange}
						onAvatarClick={handleAvatarClick}
						badgeCountByView={badgeCountByView}
					/>

					<Submenu
						title={submenuConfig.title}
						collapsed={submenuCollapsed}
						onToggleCollapse={toggleSubmenuCollapsed}
						count={submenuBadgeCount}
						filters={submenuFilters}
						activeFilter={submenuFilter}
						onFilterChange={setSubmenuFilter}
						onClearFilter={
							// Only conversations uses the inline clear affordance today;
							// Knowledge's chip is currently inert (deferred follow-up).
							activeView === "conversations" ? handleClearFilter : undefined
						}
						filtersDisabled={filtersDisabled}
					>
						{activeView === "knowledge" ? (
							<KnowledgeSubmenu
								scope={currentScope}
								topics={knowledgeTopics}
								onScopeChange={handleScopeChange}
							/>
						) : activeView === "conversations" ? (
							// @lore L10: chip-driven filtering is now wired here.
							// `activeFilter` is the narrowed `ConversationsFilter`
							// derived from `submenuFilter`. ThreadSections owns the
							// predicate; AppShell consumes the same predicate via
							// `predicateFor()` for the post-filter count badge so
							// the count and the rendered list cannot drift.
							<ThreadSections
								threads={conversationsThreads.threads}
								selectedId={selectedThreadId}
								onSelect={handleSelectThread}
								loading={conversationsThreads.status === "loading"}
								errorMessage={
									conversationsThreads.status === "error"
										? (conversationsThreads.error ?? "Network error")
										: null
								}
								onRetry={conversationsThreads.retry}
								activeFilter={conversationsFilter}
								onClearFilter={handleClearFilter}
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
							{/* @lore L8 review (Architecture C2 / Adversary B1):
							 * the lifted selected-thread id reaches the Main pane
							 * via Outlet context. ConversationsReview consumes it
							 * via `useOutletContext<AppShellOutletContext>()` and
							 * prefers it over the legacy `?id=` URL param.
							 */}
							<Outlet
								context={
									{
										selectedThreadId,
									} satisfies AppShellOutletContext
								}
							/>
						</ErrorBoundary>
					</main>

					<Rail
						expanded={railExpanded}
						onToggleExpand={toggleRailExpanded}
						bets={MOCK_RAIL_BETS}
						blockers={MOCK_RAIL_BLOCKERS}
						cost={MOCK_RAIL_COST}
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
		</ToastRegion>
	);
}
