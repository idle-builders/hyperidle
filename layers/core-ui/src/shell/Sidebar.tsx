/**
 * @lore sidebar-system: Sidebar is the persistent context-switching shell. Desktop uses
 * a 276px fixed column; mobile uses the same composition in a 300px drawer.
 * Search and Assistant are grouped in the brand row, four stable destinations
 * sit above a domain-owned navigator, and Settings stays in the footer.
 *
 * @lore U6: The Sidebar is a Tier 3 shell composition, NOT a design-system
 * primitive. Sub-items use raw <li><button> elements (not NavItem from
 * @hyperidle/design-system) because NavItem's interface does not expose the
 * data-thread-id / data-team-id attributes needed for E2E selectors.
 *
 * @lore AQ-015: destination, tool, list, and utility controls use 44px targets
 * on mobile and compact to 32–36px only in the fixed desktop column.
 *
 * @lore visual-parity-audit / testing-library quirk: The "conversations"
 * section header previously hid its visible label to avoid getByText clashing
 * with "No recent conversations". After the visual-parity fix, ALL three
 * section headers render visible text. Tests must use
 * getByRole("button", { name: /conversations/i }) — which still works — or
 * they can use getByText now that the label is always visible. The "No recent
 * conversations" empty state still uses getByText because
 * screen.getByText(/conversations/i) would find BOTH items if used naively.
 * Tests updated to use exact-match queries for the header vs substring for the
 * empty state, OR getByRole for the header button.
 *
 * @lore sidebar-system: Settings changes Main but never replaces the active domain
 * navigator. Domain-specific navigator richness is intentionally deferred to
 * registered follow-up work packages; these provisional lists preserve current
 * data and behavior without creating new sorting/grouping contracts here.
 *
 * @lore AD9: The fast-nav renders a custom <ul><li> list (not ItemList+Row) so
 * that each item can carry data-thread-id / data-team-id / data-knowledge-id
 * attrs required by E2E selectors and unit tests. Row as="li" does not support
 * arbitrary data-* props. The fast-nav items replicate Row's selected-state
 * class (bg-[var(--surface-elevated)] shadow-[var(--shadow-subtle)]) directly.
 */

// hearth-internal-padding
import type { JSX } from "react";
import { Link } from "react-router-dom";
import type { ViewId } from "./shell-types";
import { VIEW_ICONS, VIEW_IDS } from "./shell-types";

/**
 * @lore UI-080: Canonical href for each primary nav view.
 * The work href is /work (not /work/team/:id even in the 1-team case)
 * because WorkOverview already redirects when there is exactly one team,
 * and the Link-based navigation must produce a stable, bookmarkable URL.
 */
const VIEW_HREFS: Record<ViewId, string> = {
	conversations: "/conversations",
	work: "/work",
	knowledge: "/knowledge",
};

export interface SidebarThread {
	id: string;
	title: string;
	hasUnresolvedReview: boolean;
}

export interface SidebarTeam {
	id: string;
	name: string;
}

export interface SidebarKnowledgeItem {
	id: string;
	title: string;
}

export interface SidebarProps {
	/** Currently active view */
	activeView: ViewId;
	/** Handler for section header clicks */
	onViewChange: (view: ViewId) => void;

	/** Recent conversation threads (max 5 displayed) */
	threads: ReadonlyArray<SidebarThread>;
	/** Currently selected thread id (null if none) */
	selectedThreadId: string | null;
	/** Handler for thread sub-item click */
	onSelectThread: (id: string) => void;

	/** Active teams */
	teams: ReadonlyArray<SidebarTeam>;
	/** Currently active team id (from URL, null if none) */
	activeTeamId: string | null;
	/** Handler for team sub-item click */
	onSelectTeam: (id: string) => void;

	/** Knowledge items for the fast-nav list (head of /knowledge list) */
	knowledgeItems?: ReadonlyArray<SidebarKnowledgeItem>;
	/** Handler for knowledge item click */
	onSelectKnowledgeItem?: (id: string) => void;

	/** Assistant overlay trigger */
	onAssistantClick?: () => void;
	assistantOverlayOpen?: boolean;

	/** Settings trigger */
	onSettingsClick: () => void;
	settingsOpen: boolean;

	/** Search hint trigger — opens Cmd+K panel */
	onSearchClick: () => void;

	/** User avatar */
	avatarUrl?: string;
	userInitials?: string;

	/**
	 * Y4: count of items needing triage (draft + needs_human). When > 0,
	 * a numeric badge is rendered adjacent to the Knowledge section header.
	 */
	knowledgeTriageCount?: number;

	/**
	 * AD5: count of threads with unresolved reviews (blocking).
	 * When > 0, a numeric badge renders adjacent to the Conversations header.
	 */
	conversationsBlockingCount?: number;

	/**
	 * AF8: count of unseen notifications. When > 0, a red dot renders on the
	 * notification destination at the top of the stable switcher.
	 */
	unseenNotificationCount?: number;

	/**
	 * AF8: handler for the notification trigger click (opens NotificationPopover).
	 */
	onNotificationClick?: () => void;

	/**
	 * AF8: whether the NotificationPopover is currently open (for aria-expanded).
	 */
	notificationPopoverOpen?: boolean;

	/**
	 * UI-011/012/013: When true, the fast-nav sub-list for the corresponding
	 * section is still loading. Suppresses the "No X yet" empty-state message so
	 * it doesn't flash during the initial fetch or after a 429/retry.
	 */
	threadsLoading?: boolean;
	teamsLoading?: boolean;
	knowledgeLoading?: boolean;

	/**
	 * UI-011/012/013: When true, the API call for the corresponding section
	 * failed. Renders an honest "Couldn't load" message instead of the misleading
	 * "No X yet" empty state (which implies success with zero items).
	 */
	threadsError?: boolean;
	teamsError?: boolean;
	knowledgeError?: boolean;

	/**
	 * When true, the sidebar is rendered inside the mobile drawer (300px overlay).
	 * Forces nav labels visible and stacks the nav items vertically regardless of
	 * viewport width — the drawer itself is the breakpoint gate, not CSS media queries.
	 *
	 * @lore mobile-drawer-labels: nav items use `hidden min-[769px]:inline` for labels
	 * so they collapse at narrow viewports. In the drawer the viewport width stays 375px
	 * even though the drawer panel is wide enough for labels. Passing drawerMode={true}
	 * overrides the breakpoint check so the drawer shows labeled items.
	 */
	drawerMode?: boolean;
}

// ---------------------------------------------------------------------------
// W3 AC-3: Knowledge scope sub-items removed.
// Scopes are now handled as inline pills on the KnowledgeList page.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Section header button (top-level selectable item)
// AD9: active icon → --text-primary (not accent green); inactive → --text-tertiary.
// Uniform hover: accent-tinted color-mix (matches fast-nav Row hover).
// ---------------------------------------------------------------------------

interface SectionHeaderProps {
	view: ViewId;
	activeView: ViewId | "";
	onViewChange: (view: ViewId) => void;
	/** Destination href for the section Link (UI-080: nav items must be real links). */
	href: string;
	/** Optional badge count rendered to the right of the label */
	badgeCount?: number;
	drawerMode?: boolean;
}

function BrandMark(): JSX.Element {
	return (
		<svg className="h-[22px] w-[22px] shrink-0" viewBox="0 0 500 500" aria-hidden="true">
			<defs>
				<linearGradient
					id="sidebar-brand-up"
					x1="0"
					y1="250"
					x2="0"
					y2="70"
					gradientUnits="userSpaceOnUse"
				>
					<stop offset="0%" stopColor="var(--surface-container)" />
					<stop offset="100%" stopColor="var(--text-primary)" />
				</linearGradient>
				<linearGradient
					id="sidebar-brand-down"
					x1="0"
					y1="250"
					x2="0"
					y2="430"
					gradientUnits="userSpaceOnUse"
				>
					<stop offset="0%" stopColor="var(--surface-container)" />
					<stop offset="100%" stopColor="var(--text-primary)" />
				</linearGradient>
			</defs>
			<path d="M110 250c80 0 106-150 110-180 4 30 30 180 110 180Z" fill="url(#sidebar-brand-up)" />
			<path
				d="M170 250c80 0 106 150 110 180 4-30 30-180 110-180Z"
				fill="url(#sidebar-brand-down)"
			/>
		</svg>
	);
}

function NotificationButton({
	unseenNotificationCount,
	onClick,
	open,
	drawerMode,
}: {
	unseenNotificationCount?: number;
	onClick?: () => void;
	open?: boolean;
	drawerMode?: boolean;
}): JSX.Element {
	const hasUnread = (unseenNotificationCount ?? 0) > 0;
	return (
		<button
			type="button"
			data-testid="sidebar-notification-btn"
			onClick={onClick}
			aria-label="Notifications"
			aria-expanded={open}
			className={`type-control cursor-pointer relative flex h-[44px] w-full items-center gap-[9px] rounded-[var(--r-subtle)] px-[9px] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)] focus-visible:-outline-offset-1 text-[var(--text-secondary)] hover:bg-[color-mix(in_oklab,var(--text-secondary)_4%,transparent)] min-[1025px]:h-[36px] ${drawerMode ? "justify-start" : "justify-center min-[769px]:justify-start"}`}
		>
			<span className="inline-flex text-[var(--text-tertiary)]" aria-hidden="true">
				<svg
					width="17"
					height="17"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.8"
					strokeLinecap="round"
					strokeLinejoin="round"
					aria-hidden="true"
				>
					<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
					<path d="M10 21h4" />
				</svg>
			</span>
			<span className={drawerMode ? "inline" : "hidden min-[769px]:inline"}>Notifications</span>
			{hasUnread && (
				<span
					className="ml-auto h-[6px] w-[6px] rounded-[var(--r-pill)] bg-[var(--accent-primary)]"
					data-testid="notification-unread-dot"
					aria-hidden="true"
				/>
			)}
		</button>
	);
}

function SectionHeader({
	view,
	activeView,
	onViewChange,
	href,
	badgeCount,
	drawerMode,
}: SectionHeaderProps): JSX.Element {
	const isActive = view === activeView;
	const { label, icon } = VIEW_ICONS[view];

	/*
	 * @lore UI-080: SectionHeader is a real navigable link, not a button.
	 * Right-click → open in new tab, screen readers see a link destination.
	 * onViewChange is called for side effects only (e.g. closing the settings
	 * panel); Link's `to` prop handles client-side navigation.
	 *
	 * Test note (was @lore visual-parity-audit): tests must now query
	 * getByRole("link", { name: /conversations/i }) — role changed from "button".
	 */
	return (
		<Link
			to={href}
			data-section-header={view}
			data-section={view}
			data-active={isActive ? "true" : "false"}
			onClick={() => onViewChange(view)}
			aria-label={label}
			aria-current={isActive ? "page" : undefined}
			className={`type-control cursor-pointer ${[
				`flex h-[44px] w-full items-center gap-[9px] px-[9px] min-[1025px]:h-[36px] ${drawerMode ? "justify-start" : "justify-center min-[769px]:justify-start"}`,
				" ",
				"rounded-[var(--r-subtle)] mb-[3px]",
				"focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)] focus-visible:-outline-offset-1",
				// AD9: active item → elevated surface; inactive → accent-tinted hover
				// to match the fast-nav Row hover (uniform surface grammar).
				isActive
					? "bg-[var(--surface-elevated)] shadow-[var(--shadow-subtle)] text-[var(--text-primary)] "
					: "text-[var(--text-secondary)]  hover:bg-[color-mix(in_oklab,var(--accent-primary)_4%,var(--surface-elevated))]",
			].join(" ")}`}
		>
			{/* AD9: active icon → --text-primary (founder call: green clashed with
			    elevated surface); inactive → --text-tertiary for quiet/active contrast. */}
			<span
				className={
					isActive
						? "inline-flex text-[var(--text-primary)]"
						: "inline-flex text-[var(--text-tertiary)]"
				}
				aria-hidden="true"
			>
				{icon}
			</span>
			<span
				className={drawerMode ? "inline" : "hidden min-[769px]:inline"}
				data-section-label={view}
			>
				{label}
			</span>
			{badgeCount != null && badgeCount > 0 && (
				<span
					className="type-data inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-[var(--r-pill)]   tabular-nums bg-[var(--accent-primary)] text-[var(--text-on-accent)] ml-auto"
					data-testid={
						view === "knowledge"
							? "knowledge-triage-badge"
							: view === "conversations"
								? "conversations-blocking-badge"
								: `${view}-blocking-badge`
					}
				>
					{badgeCount > 99 ? "99+" : badgeCount}
				</span>
			)}
		</Link>
	);
}

// ---------------------------------------------------------------------------
// Assistant icon button — robot glyph (AD9 fix 2)
// @lore AD9: Assistant moved to TOP row (next to search field) per SidebarV2
// design (founder /human-design-review). The button is still aria-accessible.
// ---------------------------------------------------------------------------

function AssistantIconButton({
	open,
	onClick,
}: {
	open: boolean;
	onClick: () => void;
}): JSX.Element {
	return (
		<button
			type="button"
			data-testid="sidebar-assistant-btn"
			onClick={onClick}
			aria-label="Assistant"
			aria-expanded={open}
			// A pressed/open TOGGLE state, not an action Button (Button has no
			// built-in pressed treatment distinct from its 4 action variants).
			className={[
				"inline-flex cursor-pointer h-[44px] w-[44px] shrink-0 items-center justify-center min-[1025px]:h-[32px] min-[1025px]:w-[32px]",
				"  ",
				// @lore AZ7 N1: bg-[var(--accent-primary-dim)] is Set 3's row-hover /
				// selected tint — not a no-handrolled-control violation.
				open
					? "bg-[var(--accent-primary-dim)] border-[var(--accent-deep)] text-[var(--accent-deep)]"
					: "bg-[var(--surface-container)] text-[var(--text-secondary)] hover:border-[var(--border-default)] hover:text-[var(--text-primary)]",
			].join(" ")}
		>
			{/* AD9 fix 2: robot glyph. Antenna + side ears + rounded body with eyes knocked
			    out via fillRule="evenodd" so holes show button bg in both states. */}
			<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
				{/* antenna */}
				<path d="M7.25 1a.75.75 0 011.5 0v1.25h-1.5V1z" />
				<circle cx="8" cy="1" r="1.1" />
				{/* side ears */}
				<path d="M1.5 6.5h.75v3H1.5a.5.5 0 01-.5-.5V7a.5.5 0 01.5-.5zm13 0h-.75v3h.75a.5.5 0 00.5-.5V7a.5.5 0 00-.5-.5z" />
				{/* body with two eye holes knocked out (even-odd) */}
				<path
					fillRule="evenodd"
					clipRule="evenodd"
					d="M4 3.5h8a1.5 1.5 0 011.5 1.5v6A1.5 1.5 0 0112 12.5H4A1.5 1.5 0 012.5 11V5A1.5 1.5 0 014 3.5zM6 6.6a1.15 1.15 0 100 2.3 1.15 1.15 0 000-2.3zm4 0a1.15 1.15 0 100 2.3 1.15 1.15 0 000-2.3z"
				/>
			</svg>
		</button>
	);
}

function SearchAssistantTools({
	onSearchClick,
	onAssistantClick,
	assistantOpen,
}: {
	onSearchClick: () => void;
	onAssistantClick: () => void;
	assistantOpen: boolean;
}): JSX.Element {
	return (
		<fieldset
			className="border-width-thin flex shrink-0 overflow-hidden rounded-[var(--r-subtle)]  border-[var(--border-subtle)] bg-[var(--surface-container)]"
			aria-label="Search and assistant tools"
		>
			<button
				type="button"
				data-testid="sidebar-search-hint"
				onClick={onSearchClick}
				aria-label="Search"
				title="Search (⌘K)"
				className="inline-flex cursor-pointer h-[44px] w-[44px] items-center justify-center text-[var(--text-secondary)]  hover:text-[var(--text-primary)] min-[1025px]:h-[32px] min-[1025px]:w-[32px]"
			>
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.8"
					strokeLinecap="round"
					aria-hidden="true"
				>
					<circle cx="10.5" cy="10.5" r="6.5" />
					<path d="m15.5 15.5 4 4" />
				</svg>
			</button>
			<span className="my-[6px] w-px bg-[var(--border-subtle)]" aria-hidden="true" />
			<AssistantIconButton open={assistantOpen} onClick={onAssistantClick} />
		</fieldset>
	);
}

// ---------------------------------------------------------------------------
// Settings footer — a persistent icon-only utility pinned at the bottom.
// ---------------------------------------------------------------------------

function SettingsFooter({
	active,
	onClick,
}: {
	active: boolean;
	onClick: () => void;
}): JSX.Element {
	return (
		<nav
			className="border-width-thin-t flex shrink-0 justify-end  border-[var(--border-subtle)] p-[6px]"
			data-sidebar-bottom
			aria-label="App utilities"
		>
			<button
				type="button"
				data-testid="sidebar-settings-btn"
				data-active={active ? "true" : "false"}
				onClick={onClick}
				aria-label="Settings"
				aria-current={active ? "page" : undefined}
				className={`type-control cursor-pointer ${[
					"flex h-[44px] w-[44px] items-center justify-center min-[1025px]:h-[32px] min-[1025px]:w-[32px]",
					" ",
					"rounded-[var(--r-subtle)]",
					"  ",
					active
						? "bg-[var(--surface-elevated)] shadow-[var(--shadow-subtle)] text-[var(--text-primary)] "
						: "text-[var(--text-secondary)]  hover:bg-[color-mix(in_oklab,var(--accent-primary)_4%,var(--surface-elevated))]",
				].join(" ")}`}
			>
				<span
					className={
						active
							? "inline-flex text-[var(--text-primary)]"
							: "inline-flex text-[var(--text-tertiary)]"
					}
					aria-hidden="true"
				>
					{/* AD9 polish 1: Heroicons "cog-8-tooth" path (MIT), native 24 viewBox → 16px box. */}
					<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
						<path
							fillRule="evenodd"
							clipRule="evenodd"
							d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 4.889c-.02.12-.115.26-.297.348a7.493 7.493 0 00-.986.57c-.166.115-.334.126-.45.083L6.3 5.508a1.875 1.875 0 00-2.282.819l-.922 1.597a1.875 1.875 0 00.432 2.385l.84.692c.095.078.17.229.154.43a7.598 7.598 0 000 1.139c.015.2-.059.352-.153.43l-.841.692a1.875 1.875 0 00-.432 2.385l.922 1.597a1.875 1.875 0 002.282.818l1.019-.382c.115-.043.283-.031.45.082.312.214.641.405.985.57.182.088.277.228.297.35l.178 1.071c.151.904.933 1.567 1.85 1.567h1.844c.916 0 1.699-.663 1.85-1.567l.178-1.072c.02-.12.114-.26.297-.349.344-.165.673-.356.985-.57.167-.114.335-.125.45-.082l1.02.382a1.875 1.875 0 002.28-.819l.923-1.597a1.875 1.875 0 00-.432-2.385l-.84-.692c-.095-.078-.17-.229-.154-.43a7.614 7.614 0 000-1.139c-.016-.2.059-.352.153-.43l.84-.692c.708-.582.891-1.59.433-2.385l-.922-1.597a1.875 1.875 0 00-2.282-.818l-1.02.382c-.114.043-.282.031-.45-.082a7.49 7.49 0 00-.985-.57c-.182-.088-.276-.228-.297-.35l-.178-1.071a1.875 1.875 0 00-1.85-1.567h-1.843zM12 15.75a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z"
						/>
					</svg>
				</span>
			</button>
		</nav>
	);
}

// ---------------------------------------------------------------------------
// FastNavItem — custom list item with section-specific data attrs.
//
// @lore AD9: Uses a plain <li><div role="button"> pattern instead of Row as="li"
// so each item carries data-thread-id / data-team-id / data-knowledge-id for
// E2E selectors. Row does not accept arbitrary data-* props. Selected state
// uses the shell's shared accent-primary-dim row treatment.
//
// @lore AD9: aria-current="page" on the selected item satisfies the
// "active sub-item has aria-current" accessibility test.
// ---------------------------------------------------------------------------

interface FastNavItemProps {
	label: string;
	selected: boolean;
	/** Destination href — makes the item a real link (UI-080). */
	href: string;
	onClick?: () => void;
	/** Optional data attrs for section-specific E2E / unit selectors */
	"data-thread-id"?: string;
	"data-team-id"?: string;
	"data-knowledge-id"?: string;
	"data-testid"?: string;
}

function FastNavItem({
	label,
	selected,
	href,
	onClick,
	"data-thread-id": dataThreadId,
	"data-team-id": dataTeamId,
	"data-knowledge-id": dataKnowledgeId,
	"data-testid": dataTestId,
}: FastNavItemProps): JSX.Element {
	// @lore AD9: <li data-thread-id aria-current> wraps <Link> so:
	// - [data-thread-id] queries find the <li> (for E2E selectors and unit tests)
	// - [aria-current="page"] is on the <li> for semantic selected state
	// - firstItem.querySelector("a") finds the inner link for click events
	// Both the <li> selector and the <a> click target work independently.
	//
	// @lore UI-080: Changed from <button> to <Link> so items are real navigable
	// links — right-click → open in new tab, proper link semantics.
	return (
		<li
			data-thread-id={dataThreadId}
			data-team-id={dataTeamId}
			data-knowledge-id={dataKnowledgeId}
			aria-current={selected ? "page" : undefined}
			className={[selected ? "bg-[var(--accent-primary-dim)] rounded-[var(--r-subtle)]" : ""]
				.filter(Boolean)
				.join(" ")}
		>
			<Link
				to={href}
				data-testid={dataTestId}
				onClick={onClick}
				title={label}
				className={`type-control cursor-pointer ${[
					"flex h-[44px] w-full items-center rounded-[var(--r-subtle)] px-[9px] min-[1025px]:h-[34px]",
					"  text-[var(--text-primary)] truncate",
					"  ",
					"focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)]",
					!selected
						? "hover:bg-[color-mix(in_oklab,var(--accent-primary)_4%,var(--surface-elevated))]"
						: "",
				]
					.filter(Boolean)
					.join(" ")}`}
			>
				<span className="truncate">{label}</span>
			</Link>
		</li>
	);
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

export function Sidebar({
	activeView,
	onViewChange,
	threads,
	selectedThreadId,
	onSelectThread,
	teams,
	activeTeamId,
	onSelectTeam,
	knowledgeItems = [],
	onSelectKnowledgeItem,
	onAssistantClick,
	assistantOverlayOpen,
	onSettingsClick,
	settingsOpen,
	onSearchClick,
	knowledgeTriageCount,
	conversationsBlockingCount,
	unseenNotificationCount,
	onNotificationClick,
	notificationPopoverOpen,
	threadsLoading,
	teamsLoading,
	knowledgeLoading,
	threadsError,
	teamsError,
	knowledgeError,
	drawerMode,
}: SidebarProps): JSX.Element {
	// Cap threads at 5 for the fast-nav head
	const visibleThreads = threads.slice(0, 5);

	// AD9: ONE shared fast-nav list — content swaps based on activeView.
	// threads → Conversations; teams → Work (suppressed for 1 team — AD3 AC-1);
	// knowledgeItems → Knowledge.
	// AD3 AC-1: only show teams sub-list when there are 2+ teams (same as old sidebar).

	const fastNavEmpty: Record<ViewId, string> = {
		conversations: "No threads yet",
		work: "No teams yet",
		knowledge: "No knowledge yet",
	};

	// Shared empty state empty message for non-active sections (shouldn't appear)
	const emptyMessage = fastNavEmpty[activeView];

	function renderFastNavItems(): JSX.Element | null {
		if (activeView === "conversations") {
			if (visibleThreads.length === 0) {
				// UI-011: suppress empty message while initial fetch is in flight
				if (threadsLoading) return null;
				// UI-011: honest error state — don't claim "No threads yet" when the API failed
				if (threadsError) {
					return (
						<p className="type-small px-[24px] py-[12px]  text-[var(--text-tertiary)]">
							Couldn't load threads
						</p>
					);
				}
				return (
					<p className="type-small px-[24px] py-[12px]  text-[var(--text-tertiary)]">
						{emptyMessage}
					</p>
				);
			}
			return (
				<ul className="list-none m-0 p-0">
					{visibleThreads.map((t) => (
						<FastNavItem
							key={t.id}
							label={t.title}
							selected={t.id === selectedThreadId}
							href={`/conversations/${encodeURIComponent(t.id)}`}
							onClick={() => onSelectThread(t.id)}
							data-thread-id={t.id}
							data-testid={`fastnav-${t.id}`}
						/>
					))}
				</ul>
			);
		}

		if (activeView === "work") {
			// AD3 AC-1: suppress the sub-list for a single team — the Work view
			// short-circuits straight to that team's page, so a one-row list is
			// noise. Suppressed is not empty: render nothing, not "No teams yet".
			if (teams.length === 1) {
				return null;
			}
			const visibleTeams = teams;
			if (visibleTeams.length === 0) {
				// UI-012: suppress empty message while initial fetch is in flight
				if (teamsLoading) return null;
				// UI-012: honest error state — don't claim "No teams yet" when the API failed
				if (teamsError) {
					return (
						<p className="type-small px-[24px] py-[12px]  text-[var(--text-tertiary)]">
							Couldn't load teams
						</p>
					);
				}
				return (
					<p className="type-small px-[24px] py-[12px]  text-[var(--text-tertiary)]">
						{emptyMessage}
					</p>
				);
			}
			return (
				<ul className="list-none m-0 p-0">
					{visibleTeams.map((t) => (
						<FastNavItem
							key={t.id}
							label={t.name}
							selected={t.id === activeTeamId}
							href={`/work/team/${encodeURIComponent(t.id)}`}
							onClick={() => onSelectTeam(t.id)}
							data-team-id={t.id}
							data-testid={`fastnav-${t.id}`}
						/>
					))}
				</ul>
			);
		}

		if (activeView === "knowledge") {
			const visibleKnowledge = knowledgeItems.slice(0, 5);
			if (visibleKnowledge.length === 0) {
				// UI-013: suppress empty message while initial fetch is in flight
				if (knowledgeLoading) return null;
				// UI-013: honest error state — don't claim "No knowledge yet" when the API failed
				if (knowledgeError) {
					return (
						<p className="type-small px-[24px] py-[12px]  text-[var(--text-tertiary)]">
							Couldn't load knowledge
						</p>
					);
				}
				return (
					<p className="type-small px-[24px] py-[12px]  text-[var(--text-tertiary)]">
						{emptyMessage}
					</p>
				);
			}
			return (
				<ul className="list-none m-0 p-0">
					{visibleKnowledge.map((k) => (
						<FastNavItem
							key={k.id}
							label={k.title}
							selected={false}
							href={`/knowledge/${encodeURIComponent(k.id)}`}
							onClick={() => onSelectKnowledgeItem?.(k.id)}
							data-knowledge-id={k.id}
							data-testid={`fastnav-${k.id}`}
						/>
					))}
				</ul>
			);
		}

		return null;
	}

	return (
		<aside
			data-ds-shell="Sidebar"
			aria-label="App sidebar"
			className="flex h-full w-full shrink-0 flex-col bg-transparent"
		>
			<header className="flex h-[56px] shrink-0 items-center justify-between px-[12px] min-[1025px]:h-[54px]">
				<div className="type-copy flex min-w-0 items-center gap-[9px]    text-[var(--text-primary)]">
					<BrandMark />
					<span>HyperIdle</span>
				</div>
				<SearchAssistantTools
					onSearchClick={onSearchClick}
					onAssistantClick={onAssistantClick ?? (() => undefined)}
					assistantOpen={assistantOverlayOpen ?? false}
				/>
			</header>

			<nav
				className={`border-width-thin-b grid shrink-0  border-[var(--border-subtle)] px-[9px] ${
					drawerMode
						? "h-auto grid-cols-1 gap-0 pb-[9px] pt-[6px]"
						: "h-[52px] grid-cols-4 gap-[3px] pb-[3px] min-[769px]:h-auto min-[769px]:grid-cols-1 min-[769px]:gap-0 min-[769px]:pb-[9px] min-[769px]:pt-[6px]"
				}`}
				aria-label="Main navigation"
			>
				<NotificationButton
					unseenNotificationCount={unseenNotificationCount}
					onClick={onNotificationClick}
					open={notificationPopoverOpen}
					drawerMode={drawerMode}
				/>
				{VIEW_IDS.map((view) => (
					<SectionHeader
						key={view}
						view={view}
						activeView={activeView}
						onViewChange={(v) => {
							onViewChange(v);
						}}
						href={VIEW_HREFS[view]}
						drawerMode={drawerMode}
						badgeCount={
							view === "conversations"
								? conversationsBlockingCount
								: view === "knowledge"
									? knowledgeTriageCount
									: undefined
						}
					/>
				))}
			</nav>

			<div className="flex min-h-0 flex-1 flex-col" data-fastnav-section={activeView}>
				<div className="type-label flex h-[44px] shrink-0 items-center px-[12px]    uppercase  text-[var(--text-tertiary)] min-[769px]:px-[18px]">
					{VIEW_ICONS[activeView].label}
				</div>
				<div className="min-h-0 flex-1 overflow-y-auto px-[9px] pb-[18px]">
					{renderFastNavItems()}
				</div>
			</div>

			<SettingsFooter active={settingsOpen} onClick={onSettingsClick} />
		</aside>
	);
}
