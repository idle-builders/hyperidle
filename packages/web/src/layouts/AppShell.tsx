/**
 * @lore AppShell is the main layout composition: IconRail | Submenu | Main (Outlet) | Rail.
 * It manages view state, submenu state, settings panel, and global search.
 * This is NOT a custom component — it is a page-level composition assembling Tier 3 regions.
 * @lore P4: SettingsPanel modal removed. Settings now use an overlay pattern:
 * when settingsOpen, Submenu shows settings section nav + Main shows the active section.
 * The Rail/IconRail wrapper is dimmed with opacity-60 + pointer-events-none.
 */

import { NavItem } from "@hyperidle/design-system";
import { KNOWLEDGE_SCOPES, type KnowledgeScope } from "@hyperidle/fabric/types";
import { type JSX, useCallback, useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { GlobalSearchPanel } from "../components/GlobalSearchPanel";
import { RecipientPicker } from "../components/RecipientPicker";
import type { ConversationsFilter } from "../components/ThreadSections";
import { predicateFor, ThreadSections } from "../components/ThreadSections";
import { CocContext, type CocContextRef } from "../contexts/CocContext";
import { useAutoDensity } from "../hooks/useAutoDensity";
import { useCommandK } from "../hooks/useCommandK";
import { useConversationsThreads } from "../hooks/useConversationsThreads";
import { useCurrentUser } from "../hooks/useCurrentUser.js";
import { useDensity } from "../hooks/useDensity.js";
import { useRail } from "../hooks/useRail.js";
import { useViewportBreakpoint } from "../hooks/useViewportBreakpoint";
import { SettingsAppearance } from "../settings/SettingsAppearance.js";
import { SettingsBackend } from "../settings/SettingsBackend.js";
import { SettingsCredentials } from "../settings/SettingsCredentials.js";
import { SettingsNotifications } from "../settings/SettingsNotifications.js";
import { SettingsOrgChart } from "../settings/SettingsOrgChart.js";
import { SettingsTeams } from "../settings/SettingsTeams.js";
import { SettingsProfile } from "../settings/SettingsProfile.js";
import { SettingsWorker } from "../settings/SettingsWorker.js";
import { SETTINGS_SECTIONS, type SettingsSectionId } from "../settings/settings-types.js";
import { CocOverlay } from "../shell/CocOverlay";
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
		items: [{ label: "All Items", path: "/knowledge" }],
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

// @lore M3 A11: The hardcoded demo-founder-id constant was deleted — AppShell uses
// useCurrentUser() to get the authenticated founder id from /api/auth/me. The hook is called inside AppShell below.

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
	const { user } = useCurrentUser();
	const railData = useRail();
	// settingsData removed: each section component uses useSettings() directly.
	// @lore P4: useSettings() call removed from AppShell; SettingsNotifications
	// and SettingsTeams fetch their own data via the hook.

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
	// P4: active settings section — defaults to "profile" when settings opens.
	const [activeSettingsSection, setActiveSettingsSection] = useState<SettingsSectionId>("profile");

	// S4: worker section only visible in shared-mode Electron (architecture-critique W3).
	// Filter SETTINGS_SECTIONS so "worker" only appears when the bridge reports shared mode.
	const visibleSettingsSections = SETTINGS_SECTIONS.filter((section) => {
		if (section.id === "worker") {
			return (
				typeof window !== "undefined" &&
				window.__HYPERIDLE__ !== undefined &&
				window.__HYPERIDLE__?.backendMode === "shared"
			);
		}
		return true;
	});

	// L21: CoC overlay state.
	const [cocOverlayOpen, setCocOverlayOpen] = useState(false);
	const [cocContextRefs, setCocContextRefs] = useState<ReadonlyArray<CocContextRef>>([]);

	const handleCocClick = useCallback((): void => {
		setCocOverlayOpen((prev) => !prev);
	}, []);

	const handleCocClose = useCallback((): void => {
		setCocOverlayOpen(false);
	}, []);

	const handleAttachContext = useCallback((ref: CocContextRef): void => {
		setCocContextRefs((prev) => [...prev, ref]);
	}, []);

	const handleRemoveCocContextRef = useCallback((index: number): void => {
		setCocContextRefs((prev) => prev.filter((_, i) => i !== index));
	}, []);

	const cocContextValue = useMemo(
		() => ({
			overlayOpen: cocOverlayOpen,
			attachContext: handleAttachContext,
		}),
		[cocOverlayOpen, handleAttachContext],
	);
	// @lore P4: density is now managed by useDensity (localStorage-backed, reactive).
	// SettingsAppearance and AppShell both call useDensity() and sync via
	// 'hyperidle:density-change' custom event so data-density stays live.
	// @lore K7 / AESTHETICS.md § Mobile & Touch row "Auto-density behavior":
	// the user's Settings preference is the source of truth. When the
	// preference is `auto` (factory default) the viewport drives the chosen
	// preset (≤ 1024px → comfortable). The user override always wins —
	// once the user picks a non-auto value, that explicit choice persists
	// across breakpoint changes.
	// @lore P4: The old settings state (merged from API + localStorage theme) is removed.
	// Each settings section (SettingsProfile, SettingsNotifications, SettingsAppearance, etc.)
	// manages its own state directly. AppShell only needs the density for data-density attribute.
	const { density: densityPreference } = useDensity();
	const resolvedDensity = useAutoDensity(densityPreference);

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
			// P4: close settings before navigating so the view change is visible.
			setSettingsOpen(false);
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
		setActiveSettingsSection("profile");
		setSettingsOpen(true);
	}, []);

	// P4 AC-21: Escape closes the settings overlay.
	// J3: Command-K pressed while Settings is open must close Settings first,
	// then open the search. useCommandK's own document listener toggles search;
	// this effect intercepts the same key chord and routes it through the
	// settings-close path first. We attach to capture phase so we can see the
	// event before useCommandK does — then we stop propagation to prevent the
	// toggle from racing with our deliberate open call.
	useEffect(() => {
		if (!settingsOpen) return;
		const handler = (e: KeyboardEvent): void => {
			if (e.key === "Escape") {
				e.preventDefault();
				e.stopImmediatePropagation();
				setSettingsOpen(false);
				return;
			}
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
	// @lore M3 A11: participant id comes from useCurrentUser() — no more
	// hardcoded demo-founder-id constant.
	// @lore N5: pass user?.id directly (string | undefined). The hook accepts
	// string | null | undefined and short-circuits to empty ready state when
	// falsy — avoiding a 400 "Missing scope" error when no user is loaded yet.
	const conversationsThreads = useConversationsThreads(user?.id);

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
	// Q1 §4.9: recipient picker state
	const [showRecipientPicker, setShowRecipientPicker] = useState(false);

	const handleRecipientPickerSelect = useCallback(
		(recipient: { id: string; kind: "agent" | "user"; name: string }): void => {
			setShowRecipientPicker(false);
			// recipient.id is the new thread id returned by POST /api/threads
			navigate(`/conversations/${encodeURIComponent(recipient.id)}`);
		},
		[navigate],
	);

	const handleRecipientPickerCancel = useCallback((): void => {
		setShowRecipientPicker(false);
	}, []);

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

	// Q1 §4.9 / Task 15: keyboard shortcut N opens the recipient picker in the
	// Conversations view. Escape closes it. Must not fire inside text inputs.
	// @lore Q1 review issue #7: D and N must not fire inside input/textarea/
	// contenteditable. We check event.target's tagName and contenteditable attr.
	useEffect(() => {
		if (activeView !== "conversations") return;
		const handler = (e: KeyboardEvent): void => {
			// Do not fire when a text input/textarea/contenteditable is focused
			const target = e.target as HTMLElement | null;
			if (target) {
				const tag = target.tagName.toLowerCase();
				if (tag === "input" || tag === "textarea" || target.isContentEditable) {
					return;
				}
			}
			if (e.key === "n" || e.key === "N") {
				e.preventDefault();
				setShowRecipientPicker(true);
			}
			if (e.key === "Escape" && showRecipientPicker) {
				setShowRecipientPicker(false);
			}
		};
		document.addEventListener("keydown", handler);
		return () => {
			document.removeEventListener("keydown", handler);
		};
	}, [activeView, showRecipientPicker]);

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

	const knowledgeTopics: Array<{
		topic: string;
		itemCount: number;
		staleCount: number;
		health: "fresh" | "some_stale" | "mostly_stale";
	}> = [];

	const handleScopeChange = useCallback(
		(next: KnowledgeScope): void => {
			// Navigate to /knowledge with the new scope. This also covers the case
			// where the user was on /knowledge/:id — switching scope returns them
			// to the list, which is the correct "reset selection" behavior.
			navigate(`/knowledge?scope=${next}`);
		},
		[navigate],
	);

	// J3: when Settings overlay is open, dim the Rail/IconRail region visually and
	// disable pointer-events on them. Submenu and Main are NOT dimmed — they show
	// the settings nav and settings content respectively and must remain interactive.
	// @lore P4 fix: the old approach applied pointer-events-none to a wrapper that
	// contained Submenu and Main, making settings forms non-functional in a real
	// browser. The fix applies dimming per-element (Rail wrapper only) rather than
	// the parent. Submenu and Main get pointer-events-auto when settingsOpen is true.
	const shellDimmed = settingsOpen;

	return (
		<ToastRegion>
			<div
				className="flex h-screen bg-base-100 overflow-hidden"
				data-density={resolvedDensity}
				data-density-preference={densityPreference}
			>
				{/* @lore P4 fix: IconRail is NOT wrapped in the dimmed element so it
				 * stays interactive when settings is open — clicking a view icon closes
				 * settings and navigates. Rail IS wrapped so it dims during settings. */}
				<IconRail
					activeView={activeView}
					onViewChange={handleViewChange}
					onAvatarClick={handleAvatarClick}
					badgeCountByView={badgeCountByView}
				/>

				{/* P4: Settings overlay — swaps Submenu content + main content when open.
				 * @lore P4: The Submenu shows the settings section nav (7 items) and the
				 * main area shows the active settings section component. Submenu and Main
				 * are always interactive. Rail is dimmed when settings is open. */}
				<Submenu
					title={settingsOpen ? "Settings" : submenuConfig.title}
					collapsed={submenuCollapsed}
					onToggleCollapse={toggleSubmenuCollapsed}
					count={settingsOpen ? undefined : submenuBadgeCount}
					filters={settingsOpen ? [] : submenuFilters}
					activeFilter={submenuFilter}
					onFilterChange={setSubmenuFilter}
					onClearFilter={
						// Only conversations uses the inline clear affordance today;
						// Knowledge's chip is currently inert (deferred follow-up).
						settingsOpen
							? undefined
							: activeView === "conversations"
								? handleClearFilter
								: undefined
					}
					filtersDisabled={settingsOpen ? false : filtersDisabled}
				>
					{settingsOpen ? (
						// P4 AC-12: settings section NavItems when settings overlay is open
						// S4: "worker" section filtered to shared-mode Electron only
						<ul className="menu menu-sm">
							{visibleSettingsSections.map((section) => (
								<NavItem
									key={section.id}
									label={section.label}
									selected={activeSettingsSection === section.id}
									onClick={() => setActiveSettingsSection(section.id)}
								/>
							))}
						</ul>
					) : activeView === "knowledge" ? (
						<KnowledgeSubmenu
							scope={currentScope}
							topics={knowledgeTopics}
							onScopeChange={handleScopeChange}
						/>
					) : activeView === "conversations" ? (
						// Q1 §4.9: Conversations submenu shows either the RecipientPicker
						// (when showRecipientPicker is true) or the thread list with a
						// "New Thread" button above. The button is always rendered above
						// the picker/list so the user can always start a new thread.
						<>
							{!showRecipientPicker && (
								<div className="px-[2px] pb-[4px]">
									<button
										type="button"
										className="btn btn-ghost btn-xs w-full justify-start gap-[6px] text-[var(--text-lo)] hover:text-[var(--text-mid)]"
										onClick={() => setShowRecipientPicker(true)}
										data-testid="new-thread-btn"
										aria-label="New Thread"
									>
										<svg
											viewBox="0 0 16 16"
											fill="currentColor"
											className="w-[12px] h-[12px] flex-shrink-0"
											aria-hidden="true"
										>
											<path d="M8 1a.75.75 0 01.75.75v5.5h5.5a.75.75 0 010 1.5h-5.5v5.5a.75.75 0 01-1.5 0v-5.5H1.75a.75.75 0 010-1.5h5.5v-5.5A.75.75 0 018 1z" />
										</svg>
										New Thread
									</button>
								</div>
							)}
							{showRecipientPicker ? (
								<RecipientPicker
									onSelect={handleRecipientPickerSelect}
									onCancel={handleRecipientPickerCancel}
								/>
							) : (
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
							)}
						</>
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
					 * @lore P4: when settingsOpen, this pane shows the active settings
					 * section component instead of the Outlet. The main pane is always
					 * interactive (pointer-events-auto). aria-hidden is set when showing
					 * normal view content under settings, but NOT when showing settings content.
					 */
					className="flex-1 overflow-y-auto px-[var(--density-page-gutter)] py-[var(--density-page-gutter)] text-[length:var(--density-text)]"
					data-testid="main-content"
				>
					{settingsOpen ? (
						// P4 AC-11: Main pane shows the active settings section
						<ErrorBoundary>
							{activeSettingsSection === "profile" && <SettingsProfile />}
							{activeSettingsSection === "orgchart" && <SettingsOrgChart />}
							{activeSettingsSection === "credentials" && <SettingsCredentials />}
							{activeSettingsSection === "notifications" && <SettingsNotifications />}
							{activeSettingsSection === "appearance" && <SettingsAppearance />}
							{/* @lore U1: "products" section renamed to "teams". */}
							{activeSettingsSection === "teams" && <SettingsTeams />}
							{activeSettingsSection === "backend" && <SettingsBackend />}
							{activeSettingsSection === "worker" && <SettingsWorker />}
						</ErrorBoundary>
					) : (
						<CocContext.Provider value={cocContextValue}>
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
						</CocContext.Provider>
					)}
				</main>

				{/* @lore P4 fix: Rail is dimmed (pointer-events-none, opacity-60, aria-hidden)
				 * when settings is open so users cannot interact with the right panel
				 * while editing settings. IconRail (left of Submenu) stays interactive
				 * so clicking a view icon closes settings and navigates. */}
				<div
					className={shellDimmed ? "pointer-events-none opacity-60" : ""}
					aria-hidden={shellDimmed || undefined}
					data-testid="rail-wrapper"
				>
					<Rail
						expanded={railExpanded}
						onToggleExpand={toggleRailExpanded}
						bets={railData.bets}
						blockers={railData.blockers}
						cost={railData.cost}
						onCocClick={handleCocClick}
						cocOverlayOpen={cocOverlayOpen}
					/>
				</div>

				{/* P4: SettingsPanel modal removed. Settings now use the overlay pattern:
				 * Submenu swaps to Settings nav + main swaps to active settings section.
				 * See handleAvatarClick (setSettingsOpen) + Escape key handler above. */}

				<GlobalSearchPanel
					open={commandK.isOpen}
					onClose={commandK.close}
					onNavigate={handleSearchNavigate}
				/>

				{/* L21: CoC overlay — renders above Main (z-30), below Settings (z-40).
				 * Persists across navigation because it lives at AppShell root. */}
				<CocOverlay
					open={cocOverlayOpen}
					onClose={handleCocClose}
					contextRefs={cocContextRefs}
					onRemoveContextRef={handleRemoveCocContextRef}
				/>
			</div>
		</ToastRegion>
	);
}
