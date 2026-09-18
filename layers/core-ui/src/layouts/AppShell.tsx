/**
 * @lore U6: AppShell restructured. Layout is now Sidebar | Main (Outlet).
 * The old IconRail | Submenu | Main | Rail quad-column layout is replaced by
 * a 276px fixed Sidebar on the left and a flex-1 main area on the right.
 * @lore sidebar-system: Settings swaps Main content without replacing primary navigation
 * or the selected domain's navigator. Mobile exposes the same shell in a 300px drawer.
 */

import type { TeamListItem } from "@hyperidle/domain-model";
import FocusTrap from "focus-trap-react";
import type { JSX } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Outlet, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { GlobalSearchPanel } from "../components/GlobalSearchPanel";
import { RecipientPicker } from "../components/RecipientPicker";
import type { ConversationsFilter, ThreadItem } from "../components/ThreadSections";
import { AssistantContext, type AssistantContextRef } from "../contexts/AssistantContext";
import { ensureOverlayRoot, useDialogBehavior } from "../ds";
import { useCommandK } from "../hooks/useCommandK";
import { useCurrentUser } from "../hooks/useCurrentUser.js";
import { useFetch } from "../hooks/useFetch";
import { useHistoryAvailability } from "../hooks/useHistoryAvailability.js";
import { useNavShortcuts } from "../hooks/useNavShortcuts.js";
import { useTeams } from "../hooks/useTeams";
import { useThreads } from "../hooks/useThreads.js";
import { useViewportBreakpoint } from "../hooks/useViewportBreakpoint";
import { parentPathFor } from "../navigation/parentPathFor.js";
import { AssistantOverlay } from "../shell/AssistantOverlay";
import { DesktopTitleBar } from "../shell/DesktopTitleBar";
import { NotificationPopover } from "../shell/NotificationPopover";
import { Sidebar } from "../shell/Sidebar";
import type { ViewId } from "../shell/shell-types";
import { ToastRegion } from "../shell/ToastRegion";
import { relativeShort } from "../utils/time.js";

/**
 * Outlet context surfaced by AppShell to its children. Read by
 * `Conversations` and any future filter-aware page via
 * `useOutletContext<AppShellOutletContext>()`.
 *
 * @lore U6: Extended with conversationsFilter, onFilterChange, onClearFilter
 * so the Conversations page can render the pill bar (All/Blocking/Async) and
 * drive filter state that lives in AppShell (session-transient, not URL).
 *
 * @lore U6 review V1: threads/threadsStatus/threadsError/onRetryThreads are
 * passed via context so Conversations.tsx can consume the single hook call
 * already made in AppShell. This avoids the double fetch that previously
 * occurred when Conversations.tsx also called useConversationsThreads().
 */
export interface AppShellOutletContext {
	selectedThreadId: string | null;
	conversationsFilter: ConversationsFilter;
	onFilterChange: (filter: ConversationsFilter) => void;
	onClearFilter: () => void;
	/** Thread list for the main-pane ThreadSections (reuses AppShell's single fetch). */
	threads: ReadonlyArray<import("../components/ThreadSections").ThreadItem>;
	threadsStatus: "loading" | "ready" | "error";
	threadsError: string | null;
	onRetryThreads: () => void;

	/** U9 AC-1: Opens the RecipientPicker for creating a new thread. */
	onNewThread: () => void;
	/** @lore NEW-24: retries AppShell-owned fetches (user + sidebar knowledge list) so a
	 * full-outage recovery clears ALL sidebar error states, not just the main-pane error.
	 * Child pages call this alongside their own domain retry. */
	onRetryShell: () => void;
}

function capitalize(s: string): string {
	if (s.length === 0) return s;
	const first = s[0];
	return first !== undefined ? first.toUpperCase() + s.slice(1) : s;
}

/**
 * @lore BC3: replaces `useConversationsThreads.ts`'s `rowToItem` — the
 * hand-pushed `ThreadListRow` is now `search_threads`'s own output shape
 * (`title`/`computedTitle`/`lastMessagePreview`/`members`, no `participants`,
 * no client-side `blocking` guess). AppShell is the sole caller of the row
 * shape, so the mapping lives here rather than in a hook module of its own.
 */
function rowToItem(row: import("@hyperidle/domain-model").ThreadListRow): ThreadItem {
	const title =
		row.title ?? row.computedTitle ?? `${capitalize(row.hostKind)} thread ${row.id.slice(0, 8)}`;
	return {
		id: row.id,
		title,
		snippet: row.lastMessagePreview ?? "",
		timestamp: relativeShort(row.lastActiveAt),
		lastActiveAt: row.lastActiveAt,
		avatarUrl: null,
		avatars: undefined,
		hostKind: row.hostKind,
		hasUnresolvedReview: row.hasUnresolvedReview,
		blocking: false,
		status: row.hasUnresolvedReview ? "behind" : undefined,
		pinned: row.pinned,
		resolvedAt: row.resolvedAt ?? undefined,
	};
}

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
	if (/[\x00-\x1f\x7f\u0080-\u009f]/.test(id)) return null;
	// Reject "..", ".", and leading dots (path traversal).
	if (id === "." || id === ".." || id.includes("..")) return null;
	// Reject scheme-like prefixes (http:, javascript:, data:, etc.).
	if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(id)) return null;
	return encodeURIComponent(id);
}

/**
 * True when `target` sits inside an open combobox/listbox popover — a
 * document-level Escape handler must not act on that key press, or it steals
 * Escape before the popover's own bubble-phase handler ever sees it.
 *
 * @lore Combobox's open popover renders as a SIBLING of its `role="combobox"`
 * trigger button (both children of one `[data-ds-component="Combobox"]`
 * wrapper), not nested inside it — so `target.closest('[aria-expanded="true"]')`
 * alone can't find the trigger from focus inside the popover's filter input.
 * Scoping to the nearest Combobox wrapper (rather than walking every ancestor
 * up to `<body>`) is load-bearing: `<body>` contains every open combobox on
 * the page, so an unscoped `querySelector` at that level always matched,
 * regardless of where focus actually was — the guard fired even with focus
 * outside any popover, and Escape could never leave Settings.
 */
function isEscapeInsideOpenPopover(target: EventTarget | null): boolean {
	if (!(target instanceof Element)) return false;
	const comboboxRoot = target.closest('[data-ds-component="Combobox"]');
	if (!comboboxRoot) return false;
	return comboboxRoot.querySelector('[role="combobox"][aria-expanded="true"]') !== null;
}

export function AppShell(): JSX.Element {
	const location = useLocation();
	const navigate = useNavigate();
	const { user, status: userStatus, retry: retryUser } = useCurrentUser();
	// @lore U6: useRail removed (Rail component deleted).

	const activeView = useMemo(() => deriveViewFromPath(location.pathname), [location.pathname]);

	// AE4: viewport breakpoint for mobile drawer
	const { sidebarMobile } = useViewportBreakpoint();
	const { canGoBack } = useHistoryAvailability(location.key);
	const routeStateRef = useRef(
		new Map<string, { scrollTop: number; focusTestId: string | null; focusText: string | null }>(),
	);

	// Browser Back restores the origin's working context. Location keys are
	// already the router's temporal identity, so a small shell-local map is enough.
	useLayoutEffect(() => {
		const saved = routeStateRef.current.get(location.key);
		const scroller = document.querySelector<HTMLElement>("[data-page-scroll]");
		const remember = (): void => {
			const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
			const previous = routeStateRef.current.get(location.key);
			routeStateRef.current.set(location.key, {
				scrollTop: scroller?.scrollTop ?? previous?.scrollTop ?? 0,
				focusTestId: active?.dataset.testid ?? previous?.focusTestId ?? null,
				focusText: active?.dataset.testid
					? (active.textContent ?? null)
					: (previous?.focusText ?? null),
			});
		};
		document.addEventListener("focusin", remember);
		scroller?.addEventListener("scroll", remember);
		let frame = 0;
		let attempts = 0;
		const restore = (): void => {
			if (!saved) return;
			if (scroller) scroller.scrollTop = saved.scrollTop;
			if (!saved.focusTestId) return;
			const matches = document.querySelectorAll<HTMLElement>(
				`[data-testid="${saved.focusTestId}"]`,
			);
			const target =
				[...matches].find((node) => node.textContent === saved.focusText) ?? matches[0];
			if (target) target.focus();
			else if (attempts++ < 120) frame = window.requestAnimationFrame(restore);
		};
		frame = window.requestAnimationFrame(restore);
		return () => {
			window.cancelAnimationFrame(frame);
			document.removeEventListener("focusin", remember);
			scroller?.removeEventListener("scroll", remember);
		};
	}, [location.key]);
	const [drawerOpen, setDrawerOpen] = useState(false);

	// AE4: close drawer whenever the pathname changes (navigation closes drawer)
	// biome-ignore lint/correctness/useExhaustiveDependencies: location.pathname is intentional — we WANT the effect to fire on every navigation, not only when setDrawerOpen changes.
	useEffect(() => {
		setDrawerOpen(false);
	}, [location.pathname]);

	// @lore AI2/sidebar-system: Drawer uses the shared modal dismissal contract and is portalled
	// beside #root so inert applies to page content without disabling the drawer itself.
	// getOverlayProps() returns data-dialog-layer="drawer" (--z-drawer=30 via CSS var).
	// Its scrim is locally placed one level below --z-drawer; the generic dialog
	// scrim token is intentionally above non-modal drawer layers.
	const handleDrawerClose = useCallback(() => setDrawerOpen(false), []);
	const drawerBehavior = useDialogBehavior({
		open: drawerOpen,
		onClose: handleDrawerClose,
		modal: true,
		layer: "drawer",
	});
	// Compute drawer overlay/scrim props once (used in the mobile branch below).
	const drawerOverlayProps = drawerBehavior.getOverlayProps();
	const drawerScrimProps = drawerBehavior.getScrimProps();

	// @lore UI-002 / AE4: focusTrapOptions.initialFocus=false leaves focus on the
	// hamburger button (outside the portal) after the drawer opens, so the drawer's
	// own onKeyDown handler never receives the Escape event. Document-level listener
	// is the correct fix: it fires regardless of where focus lives and is guarded by
	// drawerOpen so it only runs while the drawer is visible. capture=true runs before
	// any bubble-phase handler and stops conflicting handlers from also seeing the key.
	useEffect(() => {
		if (!drawerOpen) return;
		const handler = (e: KeyboardEvent): void => {
			if (e.key === "Escape") {
				e.preventDefault();
				setDrawerOpen(false);
			}
		};
		document.addEventListener("keydown", handler, true);
		return () => {
			document.removeEventListener("keydown", handler, true);
		};
	}, [drawerOpen]);

	/**
	 * AE4: Derive whether the current route is a "detail" route that should
	 * show a back arrow instead of the hamburger.
	 *
	 * Matches:
	 *   /conversations/:id          (thread detail)
	 *   /work/task/:id              (task detail — any depth, replaces /work/bet/:id)
	 *   /work/routine/:id           (routine detail)
	 *   /work/team/:id              (team page — shows back arrow)
	 *   /knowledge/:id              (knowledge detail, but NOT /knowledge/new)
	 *   /agents/:id                 (agent detail)
	 *
	 * @lore AE4: /knowledge/new is a create page, not a detail view. The regex
	 * excludes "new" to prevent incorrectly showing a back arrow on the create page.
	 */
	const isDetailRoute = useMemo((): boolean => {
		const p = location.pathname;
		// conversations/:id
		if (/^\/conversations\/[^/]+/.test(p)) return true;
		// @lore BB1: /work/bet/:id replaced by /work/task/:id (any depth)
		if (/^\/work\/task\/[^/]+/.test(p)) return true;
		// work/routine/:id
		if (/^\/work\/routine\/[^/]+/.test(p)) return true;
		// work/team/:id
		if (/^\/work\/team\/[^/]+/.test(p)) return true;
		// knowledge/:id — exclude "new"
		if (/^\/knowledge\/(?!new$)[^/]+/.test(p)) return true;
		// agents/:id
		if (/^\/agents\/[^/]+/.test(p)) return true;
		return false;
	}, [location.pathname]);

	/**
	 * AE4: Navigate to the parent list view (explicit path, not navigate(-1)).
	 * @lore AE4: Using navigate(-1) would break deep links (opening a detail
	 * page directly in a browser would navigate back to the previous session's
	 * URL rather than the parent list). Explicit parent paths are always correct.
	 * @lore AG4: Refactored to use parentPathFor() pure fn — same resolver used
	 * by the desktop breadcrumb cluster, eliminating divergence. Unmatched routes
	 * return null and no-op (no navigate(-1) fallback — that was the latent smell).
	 */
	const navigateToParent = useCallback((): void => {
		const parent = parentPathFor(location.pathname);
		if (parent !== null && parent !== location.pathname) {
			navigate(parent);
		}
	}, [location.pathname, navigate]);

	const navigateMobileBackOrUp = useCallback((): void => {
		if (canGoBack) {
			navigate(-1);
			return;
		}
		navigateToParent();
	}, [canGoBack, navigate, navigateToParent]);

	const [searchParams, setSearchParams] = useSearchParams();
	// @lore FR-18: settingsOpen is now DERIVED from the route, not local state.
	// /settings is a real page rendered by the Outlet — no overlay needed.
	const settingsOpen = useMemo(
		() => location.pathname.startsWith("/settings"),
		[location.pathname],
	);

	// AF14 AC5: Assistant overlay state (renamed from CoC overlay).
	// @lore AF14: AF14 completes the Coc→Assistant rename started in AD8b.
	// AppShell is the single mount site for AssistantOverlay (two branches: mobile + desktop).
	const [assistantOverlayOpen, setAssistantOverlayOpen] = useState(false);
	const [assistantContextRefs, setAssistantContextRefs] = useState<
		ReadonlyArray<AssistantContextRef>
	>([]);

	const handleAssistantClick = useCallback((): void => {
		setAssistantOverlayOpen((prev) => !prev);
	}, []);

	const handleAssistantClose = useCallback((): void => {
		setAssistantOverlayOpen(false);
	}, []);

	// AF8: Notification popover open state — wired to sidebar-notification-btn.
	const [notifOpen, setNotifOpen] = useState(false);
	const handleNotificationClick = useCallback((): void => {
		setNotifOpen((prev) => !prev);
	}, []);
	const handleNotificationClose = useCallback((): void => {
		setNotifOpen(false);
	}, []);

	const handleAttachContext = useCallback((ref: AssistantContextRef): void => {
		setAssistantContextRefs((prev) => [...prev, ref]);
	}, []);

	const handleRemoveAssistantContextRef = useCallback((index: number): void => {
		setAssistantContextRefs((prev) => prev.filter((_, i) => i !== index));
	}, []);

	const assistantContextValue = useMemo(
		() => ({
			overlayOpen: assistantOverlayOpen,
			attachContext: handleAttachContext,
		}),
		[assistantOverlayOpen, handleAttachContext],
	);

	const commandK = useCommandK();

	// @lore FR-18: ?settings=open is a legacy deep-link (was used by AgentProfile).
	// Now navigates to /settings (the real route) and drops the query param.
	useEffect(() => {
		if (searchParams.get("settings") === "open") {
			navigate("/settings", { replace: true });
		}
	}, [searchParams, navigate]);

	// AE2: Auto-open the assistant overlay when ?onboarding=true is in the URL.
	// Pattern mirrors the ?settings=open handler above.
	// @lore AE2: After successful setup, SetupFlow navigates to /work/portfolio?onboarding=true.
	// AppShell detects this param, opens AssistantOverlay, and removes the param.
	useEffect(() => {
		if (searchParams.get("onboarding") === "true") {
			setAssistantOverlayOpen(true);
			setSearchParams(
				(prev) => {
					const next = new URLSearchParams(prev);
					next.delete("onboarding");
					return next;
				},
				{ replace: true },
			);
		}
	}, [searchParams, setSearchParams]);

	// @lore U6: Teams data for sidebar Work section (Q2 resolution: useTeams already exists).
	// @lore AD3: Hoisted above handleViewChange so the callback can read sidebarTeams without
	// triggering lint/correctness/noInvalidUseBeforeDeclaration.
	const { data: teamsData, loading: teamsLoading, error: teamsError } = useTeams();
	const sidebarTeams = useMemo(
		() => ((teamsData?.teams ?? []) as TeamListItem[]).map((t) => ({ id: t.id, name: t.name })),
		[teamsData],
	);

	/**
	 * Full view-change handler used for keyboard shortcuts (⌘1/2/3).
	 * @lore UI-080: Section header *clicks* go through handleSectionNavClick
	 * (side effects only) because the <Link to={href}> in SectionHeader already
	 * handles navigation. Using the full handleViewChange on clicks would push a
	 * second history entry and break back-button behaviour for the 1-team work
	 * path (Work short-circuits to /work/team/:id while the Link always goes to /work).
	 * @lore FR-18: settingsOpen is path-derived — navigating away from /settings
	 * is sufficient; no explicit setSettingsOpen(false) needed.
	 */
	const handleViewChange = useCallback(
		(view: ViewId): void => {
			if (view === "conversations") {
				navigate("/conversations");
				return;
			}
			if (view === "work") {
				// AD3 AC-1: with exactly 1 team, skip the overview and navigate directly to
				// that team's page. The sidebar suppresses the sub-list in this case too,
				// so the Work section header becomes a direct entry point.
				// AD9: 2+ teams → /work (WorkOverview; was /work/portfolio).
				// WorkOverview also enforces the 1-team short-circuit for any direct /work nav.
				if (sidebarTeams.length === 1 && sidebarTeams[0]) {
					navigate(`/work/team/${encodeURIComponent(sidebarTeams[0].id)}`);
				} else {
					navigate("/work");
				}
				return;
			}
			if (view === "knowledge") {
				navigate("/knowledge");
			}
		},
		[navigate, sidebarTeams],
	);

	/**
	 * Side-effect-only handler passed to Sidebar's onViewChange prop.
	 * Navigation is driven by the <Link to={href}> in SectionHeader.
	 * @lore FR-18: settingsOpen is path-derived — navigating away is sufficient.
	 * No explicit setter needed; keeping the callback for Sidebar's onViewChange signature.
	 */
	const handleSectionNavClick = useCallback((_view: ViewId): void => {
		// Navigation handled by SectionHeader's <Link>; path change auto-updates settingsOpen.
	}, []);

	// @lore FR-18: settings button navigates to /settings (real route).
	const handleAvatarClick = useCallback((): void => {
		navigate("/settings");
		setDrawerOpen(false);
	}, [navigate]);

	// AG4: Global keyboard shortcuts — Back (⌘[), Forward (⌘]), view switch (⌘1/2/3).
	// Wired here in AppShell (desktop + mobile both — shortcuts are global).
	// Guard: input/textarea/contentEditable targets are ignored inside useNavShortcuts.
	useNavShortcuts({
		onBack: () => navigate(-1),
		onForward: () => navigate(1),
		onSwitchView: handleViewChange,
	});

	// P4 AC-21: Escape navigates back from /settings.
	// @lore FR-18: settingsOpen is now path-derived. Closing settings = navigate(-1).
	// @lore Escape-vs-combobox: this listener runs in the CAPTURE phase on
	// document, ahead of any Settings combobox's own bubble-phase Escape
	// handling — so without the guard below, the first Escape while a
	// dropdown was open closed all of Settings instead of just the dropdown.
	// When the key belongs to an open popover, do nothing and let it
	// propagate normally so the popover's own handler closes just itself; a
	// second Escape (popover already closed) falls through to navigate(-1)
	// same as before.
	useEffect(() => {
		if (!settingsOpen) return;
		const handler = (e: KeyboardEvent): void => {
			if (e.key === "Escape") {
				if (isEscapeInsideOpenPopover(e.target)) return;
				e.preventDefault();
				e.stopImmediatePropagation();
				navigate(-1);
				return;
			}
			if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				e.stopImmediatePropagation();
				navigate(-1);
				commandK.open();
			}
		};
		document.addEventListener("keydown", handler, true);
		return () => {
			document.removeEventListener("keydown", handler, true);
		};
	}, [settingsOpen, commandK, navigate]);

	const handleSearchNavigate = useCallback(
		// Z8-151: unsafe ids previously caused silent no-ops for work/knowledge types
		// while conversation fell back to /conversations. All types now fall back
		// consistently to their list route so there is no silent failure.
		(type: string, id: string): void => {
			commandK.close();
			switch (type) {
				case "work": {
					const safeId = sanitizeRouteId(id);
					// @lore BB1: /work/bet/:id replaced by /work/task/:taskId — tasks are the one work primitive.
					navigate(safeId !== null ? `/work/task/${safeId}` : "/work");
					break;
				}
				case "knowledge": {
					const safeId = sanitizeRouteId(id);
					navigate(safeId !== null ? `/knowledge/${safeId}` : "/knowledge");
					break;
				}
				case "conversation": {
					const safeId = sanitizeRouteId(id);
					navigate(safeId !== null ? `/conversations/${safeId}` : "/conversations");
					break;
				}
				default:
					navigate("/conversations");
					break;
			}
		},
		[commandK, navigate],
	);

	// @lore M3 A11: participant id comes from useCurrentUser() — no more hardcoded demo-founder-id.
	// @lore BC3: `useConversationsThreads` → `useThreads({mine:true})`; `undefined` when
	// there is no viewer yet short-circuits the call entirely (N5's "no 400 on a fresh
	// install" guard, now inside `useThreads` itself).
	const threadsResult = useThreads(user?.id ? { mine: true } : undefined);
	const threadItems = useMemo(() => threadsResult.threads.map(rowToItem), [threadsResult.threads]);
	const conversationsThreads = {
		status: threadsResult.status,
		error: threadsResult.error,
		threads: threadItems,
		retry: threadsResult.retry,
	};

	// @lore UI-011/012/013 + NEW-23: when the user fetch fails, user?.id is undefined so
	// useThreads short-circuits to status:"ready" (N5 guard — avoids a 400
	// "Missing scope" error on a fresh install with no users). The threads hook never fires
	// and never errors. Propagate the user-fetch failure so the sidebar and Conversations
	// page show "Couldn't load" instead of a false "No threads yet" empty claim.
	const isThreadsError =
		conversationsThreads.status === "error" || (!user && userStatus === "error");
	const threadsErrorMessage =
		conversationsThreads.error ??
		(isThreadsError ? "Something went wrong. Please try again." : null);

	// @lore U6: filter state moved from Submenu to OutletContext so the Conversations page
	// renders the pill bar in the main pane (AC-16). Filter resets to "all" on view change (AC 64).
	const [conversationsFilter, setConversationsFilter] = useState<ConversationsFilter>("all");
	const handleClearFilter = useCallback((): void => {
		setConversationsFilter("all");
	}, []);

	// AC 64: reset filter to "all" on view change.
	useEffect(() => {
		void activeView;
		setConversationsFilter("all");
	}, [activeView]);

	// Q1 §4.9: recipient picker state
	const [showRecipientPicker, setShowRecipientPicker] = useState(false);

	const handleRecipientPickerSelect = useCallback(
		(recipient: { id: string; kind: "agent" | "user"; name: string }): void => {
			setShowRecipientPicker(false);
			navigate(`/conversations/${encodeURIComponent(recipient.id)}`);
		},
		[navigate],
	);

	const handleRecipientPickerCancel = useCallback((): void => {
		setShowRecipientPicker(false);
	}, []);

	// @lore L9 WARNING: selectedThreadId derived from URL for backwards-compat with outlet context consumers.
	const { threadId: urlThreadId } = useParams<{ threadId?: string }>();
	const selectedThreadId = urlThreadId ?? null;

	const handleSelectThread = useCallback(
		(id: string): void => {
			navigate(`/conversations/${encodeURIComponent(id)}`);
		},
		[navigate],
	);

	// @lore U6 Q1: keyboard shortcut N opens recipient picker in Conversations view.
	useEffect(() => {
		if (activeView !== "conversations") return;
		const handler = (e: KeyboardEvent): void => {
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

	// Derive activeTeamId from URL for Work section
	const activeTeamId = useMemo(() => {
		const match = location.pathname.match(/^\/work\/team\/([^/]+)/);
		return match ? (match[1] ?? null) : null;
	}, [location.pathname]);

	// AD9: fetch knowledge items for the Knowledge fast-nav list in the sidebar.
	// Only the head of the list (first 5) is shown; the full list is on /knowledge.
	// @lore NEW-24: refetch exposed so KnowledgeList's Retry can also clear the sidebar error.
	const {
		data: knowledgeListData,
		isLoading: knowledgeLoading,
		error: knowledgeError,
		refetch: refetchSidebarKnowledge,
	} = useFetch<{
		items: ReadonlyArray<{ id: string; title: string; parentKind?: string | null }>;
	}>("/api/knowledge");
	// @lore nested-knowledge-items §4: the same parent rule KnowledgeList
	// applies — a role-carrying binding (skill/rule/agent identity/routine
	// prompt) has a non-`knowledge_item` parent and is reached from its own
	// surface, not the fast-nav.
	const sidebarKnowledgeItems = useMemo(
		() =>
			(knowledgeListData?.items ?? [])
				.filter(
					(k) =>
						k.parentKind === null ||
						k.parentKind === undefined ||
						k.parentKind === "knowledge_item",
				)
				.slice(0, 5)
				.map((k) => ({ id: k.id, title: k.title })),
		[knowledgeListData],
	);

	// AE4: Derive blocking count from thread list (threads with unresolved reviews).
	// @lore AE4: conversationsBlockingCount is not fetched separately — it is derived
	// from the thread list already loaded for the sidebar. This avoids an extra API call.
	// The same derived value is passed to Sidebar so the badge renders correctly (AD5 gap).
	const conversationsBlockingCount = useMemo(
		() => conversationsThreads.threads.filter((t) => t.hasUnresolvedReview).length,
		[conversationsThreads.threads],
	);

	// AE4: notification dot on hamburger — signals "items need attention".
	const hasAttentionItems = conversationsBlockingCount > 0;

	// AE4: page title for mobile header.
	const pageTitle = useMemo((): string => {
		if (settingsOpen) return "Settings";
		const p = location.pathname;
		if (p.startsWith("/conversations")) {
			if (selectedThreadId) {
				const thread = conversationsThreads.threads.find((t) => t.id === selectedThreadId);
				return thread?.title ?? "Conversations";
			}
			return "Conversations";
		}
		if (p.startsWith("/work/portfolio")) return "Work";
		if (p.startsWith("/work/team/")) return "Work";
		// @lore BB1: /work/bet/:id replaced by /work/task/:id
		if (p.startsWith("/work/task/")) return "Work";
		if (p.startsWith("/work/routine/")) return "Work";
		if (p.startsWith("/work")) return "Work";
		if (p.startsWith("/knowledge")) return "Knowledge";
		if (p.startsWith("/agents")) return "Agents";
		return "HyperIdle";
	}, [location.pathname, settingsOpen, selectedThreadId, conversationsThreads.threads]);

	// Thread list for sidebar (top 5, no filter applied to sidebar sub-items)
	const sidebarThreads = useMemo(
		() =>
			conversationsThreads.threads.slice(0, 5).map((t) => ({
				id: t.id,
				title: t.title,
				hasUnresolvedReview: t.hasUnresolvedReview,
			})),
		[conversationsThreads.threads],
	);

	// Shared sidebar props used in both desktop and mobile drawer branches.
	const sidebarProps = {
		activeView,
		// @lore UI-080: handleSectionNavClick (side effects only) — Link navigation
		// in SectionHeader handles routing. handleViewChange (navigate included)
		// is wired to useNavShortcuts below for ⌘1/⌘2/⌘3.
		onViewChange: handleSectionNavClick,
		threads: sidebarThreads,
		selectedThreadId,
		onSelectThread: handleSelectThread,
		teams: sidebarTeams,
		activeTeamId,
		onSelectTeam: (id: string) => navigate(`/work/team/${encodeURIComponent(id)}`),
		knowledgeItems: sidebarKnowledgeItems,
		onSelectKnowledgeItem: (id: string) => navigate(`/knowledge/${encodeURIComponent(id)}`),
		onAssistantClick: handleAssistantClick,
		assistantOverlayOpen,
		onSettingsClick: handleAvatarClick,
		settingsOpen,
		onSearchClick: commandK.open,
		avatarUrl: user?.avatarUrl ?? undefined,
		userInitials: user?.name
			? user.name
					.split(" ")
					.map((w) => w[0])
					.join("")
					.slice(0, 2)
					.toUpperCase()
			: undefined,
		conversationsBlockingCount,
		onNotificationClick: handleNotificationClick,
		notificationPopoverOpen: notifOpen,
		// UI-011/012/013: suppress false "No X yet" messages during initial load
		threadsLoading: conversationsThreads.status === "loading",
		teamsLoading,
		knowledgeLoading,
		// UI-011/012/013: honest error states — sidebar shows "Couldn't load X" not "No X yet"
		threadsError: isThreadsError,
		teamsError: teamsError !== null,
		knowledgeError: knowledgeError !== null,
	} as const;

	// Shared main content used in both mobile and desktop branches.
	// @lore FR-18: SettingsPage is now a real route — rendered via Outlet at /settings.
	// No conditional overlay needed; AssistantContext wraps Outlet for all routes
	// (SettingsPage simply doesn't use it — that's fine).
	const mainContent = (
		<main
			/*
			 * @lore W2: density tokens removed. Using Hearth default page gutter (24px).
			 * @lore U6: Main pane is now the only content area (no Submenu or Rail).
			 */
			id="main-content"
			className="type-copy flex-1 flex flex-col overflow-hidden bg-[var(--surface-elevated)] rounded-[var(--r-default)] shadow-[var(--shadow-default)] min-w-0"
			data-shell-surface="main"
			data-testid="main-content"
		>
			<AssistantContext.Provider value={assistantContextValue}>
				<ErrorBoundary>
					{/*
					 * @lore U6: Outlet context extended with filter props so Conversations
					 * page renders the pill bar in the main pane (AC-16).
					 * @lore L9: selectedThreadId derived from URL params for backwards-compat.
					 * @lore visual-parity Issue 6: RecipientPicker replaces the Outlet entirely
					 * so it fills the main pane rather than stacking above it. The Outlet is
					 * still rendered (hidden) to avoid unmounting side-effects.
					 */}
					{showRecipientPicker && activeView === "conversations" && (
						<div className="flex flex-1 items-start justify-center p-[24px]">
							<div className="w-full max-w-[480px]">
								<div className="type-title text-[var(--text-primary)] mb-[18px]">
									New conversation
								</div>
								<RecipientPicker
									onSelect={handleRecipientPickerSelect}
									onCancel={handleRecipientPickerCancel}
								/>
							</div>
						</div>
					)}
					<div
						className={
							showRecipientPicker && activeView === "conversations" ? "hidden" : "contents"
						}
					>
						<Outlet
							context={
								{
									selectedThreadId,
									conversationsFilter,
									onFilterChange: setConversationsFilter,
									onClearFilter: handleClearFilter,
									/** U9 AC-1: opens RecipientPicker for new thread creation. */
									onNewThread: () => setShowRecipientPicker(true),
									threads: conversationsThreads.threads,
									threadsStatus: isThreadsError ? "error" : conversationsThreads.status,
									threadsError: threadsErrorMessage,
									// @lore NEW-24: also retries user+sidebar-knowledge fetches so the N5
									// short-circuit unblocks and the sidebar fully clears after an outage.
									onRetryThreads: () => {
										conversationsThreads.retry();
										retryUser();
										refetchSidebarKnowledge();
									},
									onRetryShell: () => {
										retryUser();
										refetchSidebarKnowledge();
									},
								} satisfies AppShellOutletContext
							}
						/>
					</div>
				</ErrorBoundary>
			</AssistantContext.Provider>
		</main>
	);

	// AE4: Mobile layout branch (viewport <= 768px)
	if (sidebarMobile) {
		return (
			<ToastRegion>
				{/* UI-084: skip link — first focusable element; lands on <main id="main-content"> */}
				<a
					href="#main-content"
					className="absolute left-0 top-0 z-[100] -translate-y-full focus:translate-y-0 type-control rounded-[var(--r-subtle)] bg-[var(--surface-elevated)] px-[12px] py-[6px] text-[var(--text-primary)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)]"
				>
					Skip to main content
				</a>
				<div className="flex flex-col h-screen bg-[var(--surface-container)] overflow-hidden">
					{/* AV5: Desktop titlebar — null in browser → layout-neutral; shrink-0 in Electron */}
					<DesktopTitleBar />
					{/* Mobile header — 48px + safe-area-inset-top */}
					<header
						className="border-width-thin-b shrink-0 flex items-center h-[48px] px-[12px] bg-[var(--surface-elevated)] border-[var(--border-subtle)]"
						style={{ paddingTop: "env(safe-area-inset-top)" }}
					>
						{isDetailRoute && (
							<button
								type="button"
								data-testid="mobile-back-button"
								onClick={navigateMobileBackOrUp}
								aria-label={
									canGoBack
										? "Back"
										: `Up to ${activeView === "knowledge" ? "Knowledge" : activeView === "work" ? "Work" : "Conversations"}`
								}
								className="flex cursor-pointer items-center justify-center w-[48px] h-[48px] shrink-0 text-[var(--text-secondary)]"
							>
								{/* Chevron-left icon */}
								<svg
									width="24"
									height="24"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
									aria-hidden="true"
								>
									<polyline points="15 18 9 12 15 6" />
								</svg>
							</button>
						)}
						<button
							type="button"
							data-testid="mobile-hamburger"
							onClick={() => setDrawerOpen(true)}
							aria-label="Open navigation"
							aria-expanded={drawerOpen}
							className="relative flex cursor-pointer items-center justify-center w-[48px] h-[48px] shrink-0 text-[var(--text-secondary)]"
						>
							{/* Hamburger icon */}
							<svg
								width="24"
								height="24"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
								aria-hidden="true"
							>
								<line x1="3" y1="6" x2="21" y2="6" />
								<line x1="3" y1="12" x2="21" y2="12" />
								<line x1="3" y1="18" x2="21" y2="18" />
							</svg>
							{/* Notification dot — signals "items need attention" */}
							{hasAttentionItems && (
								<span
									className="absolute top-[8px] right-[8px] w-[6px] h-[6px] rounded-[var(--r-pill)] bg-[var(--accent-primary)]"
									aria-hidden="true"
								/>
							)}
						</button>
						{/* @lore UI-144/145: h1 in PageHeader provides the semantic title; this span is visual-only */}
						<span
							aria-hidden="true"
							className="type-copy flex-1 text-[var(--text-primary)] truncate px-[6px]"
						>
							{pageTitle}
						</span>
						<button
							type="button"
							onClick={commandK.open}
							aria-label="Search"
							className="flex cursor-pointer items-center justify-center w-[48px] h-[48px] shrink-0 text-[var(--text-secondary)]"
						>
							{/* Search icon */}
							<svg
								width="24"
								height="24"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
								aria-hidden="true"
							>
								<circle cx="11" cy="11" r="8" />
								<line x1="21" y1="21" x2="16.65" y2="16.65" />
							</svg>
						</button>
					</header>

					{/* Main content — full width */}
					{mainContent}

					{/* Drawer overlay
					 * @lore AE4: CSS transform transition for GPU-accelerated slide animation.
					 * The drawer slides from translateX(-100%) (offscreen left) to translateX(0)
					 * using --motion-default (240ms) easing. Always rendered when drawerOpen
					 * is true so the transition plays correctly.
					 * @lore AE4: focus-trap-react with tabbableOptions.displayCheck="none"
					 * matches the GlobalSearchPanel pattern — required for jsdom compatibility.
					 * @lore AI2: Drawer uses useDialogBehavior (modal=true, layer="drawer").
					 * The local scrim sits one layer below --z-drawer so the portalled drawer
					 * remains visible and interactive while page content is inert.
					 */}
					{drawerOpen &&
						createPortal(
							<>
								{drawerScrimProps && (
									<div
										data-testid="mobile-scrim"
										aria-hidden="true"
										className="fixed inset-0"
										style={{
											...drawerScrimProps.style,
											zIndex: "calc(var(--z-drawer) - 1)",
										}}
										onMouseDown={drawerScrimProps.onMouseDown}
									/>
								)}
								<FocusTrap
									focusTrapOptions={{
										initialFocus: false,
										allowOutsideClick: true,
										fallbackFocus: "[data-testid='mobile-drawer']",
										tabbableOptions: { displayCheck: "none" },
									}}
								>
									<div
										data-testid="mobile-drawer"
										role="dialog"
										aria-modal="true"
										aria-label="Navigation"
										data-dialog-layer={drawerOverlayProps["data-dialog-layer"]}
										className="fixed inset-y-0 left-0 w-[300px] bg-[var(--surface-elevated)] overflow-hidden"
										style={{
											zIndex: drawerOverlayProps.style.zIndex,
											paddingTop: "env(safe-area-inset-top)",
											transform: "translateX(0)",
										}}
										onKeyDown={drawerOverlayProps.onKeyDown}
									>
										{/* drawerMode forces labels visible — viewport stays 375px inside the overlay */}
										<Sidebar {...sidebarProps} drawerMode />
									</div>
								</FocusTrap>
							</>,
							ensureOverlayRoot(),
						)}

					<GlobalSearchPanel
						open={commandK.isOpen}
						onClose={commandK.close}
						onNavigate={handleSearchNavigate}
					/>

					{/* AF8: NotificationPopover — anchored to sidebar-notification-btn, z-50 */}
					<NotificationPopover open={notifOpen} onClose={handleNotificationClose} />

					{/* AF14 AC5: AssistantOverlay — renders above Main (z-30), below drawer (z-40). */}
					<AssistantOverlay
						open={assistantOverlayOpen}
						onClose={handleAssistantClose}
						contextRefs={assistantContextRefs}
						onRemoveContextRef={handleRemoveAssistantContextRef}
					/>
				</div>
			</ToastRegion>
		);
	}

	// Desktop layout branch (viewport > 768px)
	return (
		<ToastRegion>
			{/* UI-084: skip link — first focusable element; lands on <main id="main-content"> */}
			<a
				href="#main-content"
				className="absolute left-0 top-0 z-[100] -translate-y-full focus:translate-y-0 type-control rounded-[var(--r-subtle)] bg-[var(--surface-elevated)] px-[12px] py-[6px] text-[var(--text-primary)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)]"
			>
				Skip to main content
			</a>
			<div className="flex h-screen bg-[var(--surface-container)] overflow-hidden gap-[9px] p-[9px]">
				{/* @lore U6: Sidebar replaces IconRail | Submenu | Rail trio. */}
				{/* @lore sidebar-system: Sidebar uses w-full internally; its parent owns the 276px
				 * desktop width and the mobile drawer owns the 300px width. */}
				{/* @lore POLISH-060 A4: h-full + overflow-hidden clamps the sidebar to the
				 * viewport height so only the fast-nav list scrolls (Sidebar.tsx:651 is
				 * already flex-1 min-h-0 overflow-y-auto). Without this clamp the whole
				 * aside can scroll instead of just its fast-nav region. */}
				{/*
				 * @lore AV5: DesktopTitleBar lives only in the sidebar column — not full-width.
				 * macOS hiddenInset traffic-lights float top-left over the sidebar area; the
				 * 28px drag inset shifts search/nav down clear of them. Main content card is a
				 * direct child of the root row and still reaches the window top (only the 9px
				 * p-[9px] gutter above it). DesktopTitleBar returns null in browser → no shift.
				 */}
				<div className="w-[276px] shrink-0 h-full overflow-hidden flex flex-col">
					<DesktopTitleBar />
					<div className="flex-1 min-h-0 overflow-hidden">
						<Sidebar {...sidebarProps} />
					</div>
				</div>

				{mainContent}

				<GlobalSearchPanel
					open={commandK.isOpen}
					onClose={commandK.close}
					onNavigate={handleSearchNavigate}
				/>

				{/* AF8: NotificationPopover — anchored to sidebar-notification-btn, z-50 */}
				<NotificationPopover open={notifOpen} onClose={handleNotificationClose} />

				{/* AF14 AC5: AssistantOverlay — renders above Main (z-30), below Settings (z-40). */}
				<AssistantOverlay
					open={assistantOverlayOpen}
					onClose={handleAssistantClose}
					contextRefs={assistantContextRefs}
					onRemoveContextRef={handleRemoveAssistantContextRef}
				/>
			</div>
		</ToastRegion>
	);
}
