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
import { ensureOverlayRoot, LiveDot, useDialogBehavior } from "../ds";
import { useCommandK } from "../hooks/useCommandK";
import { useCurrentUser } from "../hooks/useCurrentUser.js";
import { useDocuments } from "../hooks/useDocuments.js";
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

/** Outlet context surfaced by AppShell to its children. Read via `useOutletContext<AppShellOutletContext>()`. */
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

	/** Opens the RecipientPicker for creating a new thread. */
	onNewThread: () => void;
	onRetryShell: () => void;
}

function rowToItem(row: import("@hyperidle/domain-model").ThreadListRow): ThreadItem {
	// `computedTitle` is required and never empty (ThreadListRowSchema), so
	// this always resolves without a synthesized fallback.
	const title = row.title ?? row.computedTitle;
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

export function pathToView(pathname: string): ViewId {
	if (pathname.startsWith("/work")) return "work";
	if (pathname.startsWith("/documents")) return "knowledge";
	return "conversations";
}

// @lore: sanitizeRouteId — search API emits agent-produced ids; encode or reject before navigate(); trust boundary is /api/search output, not the mock
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

// @lore: isEscapeInsideOpenPopover — Combobox popover is a sibling of trigger, not nested; closest('[aria-expanded]') misses it; scope to Combobox wrapper
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

	const activeView = useMemo(() => pathToView(location.pathname), [location.pathname]);

	const { sidebarMobile } = useViewportBreakpoint();
	const { canGoBack } = useHistoryAvailability(location.key);
	const routeStateRef = useRef(
		new Map<string, { scrollTop: number; focusTestId: string | null; focusText: string | null }>(),
	);

	// Browser Back restores the origin's working context — a shell-local map keyed on location.key is enough.
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

	// biome-ignore lint/correctness/useExhaustiveDependencies: location.pathname is intentional — we WANT the effect to fire on every navigation, not only when setDrawerOpen changes.
	useEffect(() => {
		setDrawerOpen(false);
	}, [location.pathname]);

	// @lore: drawer — portalled beside #root; inert on page content only; scrim sits below --z-drawer; dialog scrim token intentionally above non-modal drawer layers
	const handleDrawerClose = useCallback(() => setDrawerOpen(false), []);
	const drawerBehavior = useDialogBehavior({
		open: drawerOpen,
		onClose: handleDrawerClose,
		modal: true,
		layer: "drawer",
	});
	const drawerOverlayProps = drawerBehavior.getOverlayProps();
	const drawerScrimProps = drawerBehavior.getScrimProps();

	// @lore: drawer Escape — initialFocus=false leaves focus on the hamburger; drawer's onKeyDown never fires (portal); document-level capture listener required
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

	const isDetailRoute = useMemo((): boolean => {
		const p = location.pathname;
		if (/^\/conversations\/[^/]+/.test(p)) return true;
		if (/^\/work\/task\/[^/]+/.test(p)) return true;
		if (/^\/work\/team\/[^/]+/.test(p)) return true;
		if (/^\/documents\/(?!new$)[^/]+/.test(p)) return true;
		if (/^\/agents\/[^/]+/.test(p)) return true;
		return false;
	}, [location.pathname]);

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
	const settingsOpen = useMemo(
		() => location.pathname.startsWith("/settings"),
		[location.pathname],
	);

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

	useEffect(() => {
		if (searchParams.get("settings") === "open") {
			navigate("/settings", { replace: true });
		}
	}, [searchParams, navigate]);

	// Auto-open the assistant overlay when ?onboarding=true is in the URL, then remove the param.
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

	const { data: teamsData, loading: teamsLoading, error: teamsError } = useTeams();
	const sidebarTeams = useMemo(
		() => (teamsData?.teams ?? []).map((t) => ({ id: t.id, name: t.name })),
		[teamsData],
	);

	// @lore: handleViewChange — keyboard ⌘1/2/3 only; section <Link> handles clicks; routing it through here adds history entry and breaks back-button on 1-team work
	const handleViewChange = useCallback(
		(view: ViewId): void => {
			if (view === "conversations") {
				navigate("/conversations");
				return;
			}
			if (view === "work") {
				// With exactly 1 team, skip the overview and navigate directly to
				// that team's page. The sidebar suppresses the sub-list in this case too,
				// so the Work section header becomes a direct entry point.
				// 2+ teams → /work (WorkOverview).
				// WorkOverview also enforces the 1-team short-circuit for any direct /work nav.
				if (sidebarTeams.length === 1 && sidebarTeams[0]) {
					navigate(`/work/team/${encodeURIComponent(sidebarTeams[0].id)}`);
				} else {
					navigate("/work");
				}
				return;
			}
			if (view === "knowledge") {
				navigate("/documents");
			}
		},
		[navigate, sidebarTeams],
	);

	const handleSectionNavClick = useCallback((_view: ViewId): void => {
		// Navigation handled by SectionHeader's <Link>; path change auto-updates settingsOpen.
	}, []);

	const handleAvatarClick = useCallback((): void => {
		navigate("/settings");
		setDrawerOpen(false);
	}, [navigate]);

	useNavShortcuts({
		onBack: () => navigate(-1),
		onForward: () => navigate(1),
		onSwitchView: handleViewChange,
	});

	// @lore: settings Escape — capture-phase runs before combobox bubbling; without isEscapeInsideOpenPopover guard, Escape closes Settings instead of the dropdown
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
		(type: string, id: string): void => {
			commandK.close();
			switch (type) {
				case "work": {
					const safeId = sanitizeRouteId(id);
					navigate(safeId !== null ? `/work/task/${safeId}` : "/work");
					break;
				}
				case "document": {
					const safeId = sanitizeRouteId(id);
					navigate(safeId !== null ? `/documents/${safeId}` : "/documents");
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

	const threadsResult = useThreads(user?.id ? { mine: true } : undefined);
	const threadItems = useMemo(() => threadsResult.threads.map(rowToItem), [threadsResult.threads]);
	const conversationsThreads = {
		status: threadsResult.status,
		error: threadsResult.error,
		threads: threadItems,
		retry: threadsResult.retry,
	};

	// Propagate user-fetch failure so the sidebar shows an error instead of a false "No threads yet" empty state.
	const isThreadsError =
		conversationsThreads.status === "error" || (!user && userStatus === "error");
	const threadsErrorMessage =
		conversationsThreads.error ??
		(isThreadsError ? "Something went wrong. Please try again." : null);

	const [conversationsFilter, setConversationsFilter] = useState<ConversationsFilter>("all");
	const handleClearFilter = useCallback((): void => {
		setConversationsFilter("all");
	}, []);

	useEffect(() => {
		void activeView;
		setConversationsFilter("all");
	}, [activeView]);

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

	const { threadId: urlThreadId } = useParams<{ threadId?: string }>();
	const selectedThreadId = urlThreadId ?? null;

	const handleSelectThread = useCallback(
		(id: string): void => {
			navigate(`/conversations/${encodeURIComponent(id)}`);
		},
		[navigate],
	);

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

	const activeTeamId = useMemo(() => {
		const match = location.pathname.match(/^\/work\/team\/([^/]+)/);
		return match ? (match[1] ?? null) : null;
	}, [location.pathname]);

	const {
		documents: sidebarDocuments,
		status: sidebarDocumentsStatus,
		error: sidebarDocumentsError,
		retry: retrySidebarDocuments,
	} = useDocuments({ inTree: true, limit: 50 });
	const documentsLoading = sidebarDocumentsStatus === "loading";
	const documentsError = sidebarDocumentsStatus === "error" ? sidebarDocumentsError : null;
	const sidebarDocumentItems = useMemo(
		() =>
			sidebarDocuments
				.filter(
					(d) => d.parentKind === null || d.parentKind === undefined || d.parentKind === "document",
				)
				.slice(0, 5)
				.map((d) => ({ id: d.id, title: d.title })),
		[sidebarDocuments],
	);

	// Derived from the thread list already loaded for the sidebar — avoids a separate API call.
	const conversationsBlockingCount = useMemo(
		() => conversationsThreads.threads.filter((t) => t.hasUnresolvedReview).length,
		[conversationsThreads.threads],
	);

	const hasAttentionItems = conversationsBlockingCount > 0;

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
		if (p.startsWith("/work/task/")) return "Work";
		if (p.startsWith("/work")) return "Work";
		if (p.startsWith("/documents")) return "Knowledge";
		if (p.startsWith("/agents")) return "Agents";
		return "HyperIdle";
	}, [location.pathname, settingsOpen, selectedThreadId, conversationsThreads.threads]);

	const sidebarThreads = useMemo(
		() =>
			conversationsThreads.threads.slice(0, 5).map((t) => ({
				id: t.id,
				title: t.title,
				hasUnresolvedReview: t.hasUnresolvedReview,
			})),
		[conversationsThreads.threads],
	);

	const sidebarProps = {
		activeView,
		onViewChange: handleSectionNavClick,
		threads: sidebarThreads,
		selectedThreadId,
		onSelectThread: handleSelectThread,
		teams: sidebarTeams,
		activeTeamId,
		onSelectTeam: (id: string) => navigate(`/work/team/${encodeURIComponent(id)}`),
		documentItems: sidebarDocumentItems,
		onSelectDocumentItem: (id: string) => navigate(`/documents/${encodeURIComponent(id)}`),
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
		threadsLoading: conversationsThreads.status === "loading",
		teamsLoading,
		documentsLoading,
		threadsError: isThreadsError,
		teamsError: teamsError !== null,
		documentsError: documentsError !== null,
	} as const;

	// Shared main content used in both mobile and desktop branches.
	const mainContent = (
		<main
			id="main-content"
			className="type-copy flex-1 flex flex-col overflow-hidden bg-[var(--surface-elevated)] rounded-[var(--r-default)] shadow-[var(--shadow-default)] min-w-0"
			data-shell-surface="main"
			data-testid="main-content"
		>
			<AssistantContext.Provider value={assistantContextValue}>
				<ErrorBoundary>
					{/* @lore: Outlet still rendered hidden when RecipientPicker is active — unmounting tears down side-effects in child routes */}
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
									onNewThread: () => setShowRecipientPicker(true),
									threads: conversationsThreads.threads,
									threadsStatus: isThreadsError ? "error" : conversationsThreads.status,
									threadsError: threadsErrorMessage,
									onRetryThreads: () => {
										conversationsThreads.retry();
										retryUser();
										retrySidebarDocuments();
									},
									onRetryShell: () => {
										retryUser();
										retrySidebarDocuments();
									},
								} satisfies AppShellOutletContext
							}
						/>
					</div>
				</ErrorBoundary>
			</AssistantContext.Provider>
		</main>
	);

	if (sidebarMobile) {
		return (
			<ToastRegion>
				<a
					href="#main-content"
					className="absolute left-0 top-0 z-[100] -translate-y-full focus:translate-y-0 type-control rounded-[var(--r-subtle)] bg-[var(--surface-elevated)] px-[12px] py-[6px] text-[var(--text-primary)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)]"
				>
					Skip to main content
				</a>
				<div className="flex flex-col h-screen bg-[var(--surface-container)] overflow-hidden">
					<DesktopTitleBar />
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
							{hasAttentionItems && (
								<span className="absolute top-[8px] right-[8px]">
									<LiveDot />
								</span>
							)}
						</button>
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

					{mainContent}

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

					<NotificationPopover open={notifOpen} onClose={handleNotificationClose} />

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

	return (
		<ToastRegion>
			<a
				href="#main-content"
				className="absolute left-0 top-0 z-[100] -translate-y-full focus:translate-y-0 type-control rounded-[var(--r-subtle)] bg-[var(--surface-elevated)] px-[12px] py-[6px] text-[var(--text-primary)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)]"
			>
				Skip to main content
			</a>
			<div className="flex h-screen bg-[var(--surface-container)] overflow-hidden gap-[9px] p-[9px]">
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

				<NotificationPopover open={notifOpen} onClose={handleNotificationClose} />

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
