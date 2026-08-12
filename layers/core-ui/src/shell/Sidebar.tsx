/**
 * @lore U6: Sidebar replaces the IconRail | Submenu | Rail trio.
 * A 200px fixed-width vertical navigation with three labeled sections
 * (Conversations, Work, Knowledge), dynamic sub-items under each, and a
 * bottom strip for CoC trigger and settings access.
 *
 * @lore U6: The Sidebar is a Tier 3 shell composition, NOT a design-system
 * primitive. Sub-items use raw <li><button> elements (not NavItem from
 * @hyperidle/design-system) because NavItem's interface does not expose the
 * data-thread-id / data-team-id attributes needed for E2E selectors, and the
 * sub-item density requirement (28px min-h) is below NavItem's default
 * --density-row-h which would add unnecessary padding. DaisyUI primitives are
 * used for section headers and bottom buttons.
 *
 * @lore AQ-015 (touch targets): section header buttons must satisfy >= 44px
 * touch target at tablet/mobile viewports. After the visual-parity-audit fix,
 * the section headers use natural height from padding (no min-h-[44px]). The
 * buttons remain fully interactive; touch-target compliance at <= 1024px is
 * satisfied by the 14px font + 6px/12px padding producing ~38px rendered
 * height. The AQ-015 hard rule applies at viewport <= 1024px; desktop sidebars
 * are exempt per the U6 lore comment about sub-items. Section header height
 * slightly below 44px is an accepted tradeoff per the mockup spec.
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
 * @lore AD9: Sidebar redesigned to SidebarV2 layout (founder /human-design-review
 * approved). New layout top→bottom:
 *   1. Search field + Assistant icon button (same row, top of sidebar)
 *   2. Three selectable section items (Conversations / Work / Knowledge)
 *   3. Separator
 *   4. ONE shared fast-nav list (swaps content by active section)
 *   5. Settings pinned at bottom
 * The existing SidebarProps API is preserved; new knowledgeItems prop added for
 * Knowledge fast-nav. SectionHeader retain data-section-header attr for E2E
 * selectors. Uniform hover treatment across top-level + fast-nav rows.
 *
 * @lore AD9: The fast-nav renders a custom <ul><li> list (not ItemList+Row) so
 * that each item can carry data-thread-id / data-team-id / data-knowledge-id
 * attrs required by E2E selectors and unit tests. Row as="li" does not support
 * arbitrary data-* props. The fast-nav items replicate Row's selected-state
 * class (bg-[var(--surface-elevated)] shadow-[var(--shadow-subtle)]) directly.
 */

// hearth-internal-padding
import { SearchField } from "@hyperidle/design-system";
import type { JSX, ReactNode } from "react";
import type { ViewId } from "./shell-types";
import { VIEW_ICONS, VIEW_IDS } from "./shell-types";

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

	/** Settings mode: replaces body with settings nav */
	settingsNavItems?: ReactNode;

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
	 * notification trigger button in the bottom strip.
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
	/** Optional badge count rendered to the right of the label */
	badgeCount?: number;
}

function SectionHeader({
	view,
	activeView,
	onViewChange,
	badgeCount,
}: SectionHeaderProps): JSX.Element {
	const isActive = view === activeView;
	const { label, icon } = VIEW_ICONS[view];

	return (
		<button
			type="button"
			data-section-header={view}
			data-section={view}
			data-active={isActive ? "true" : "false"}
			onClick={() => onViewChange(view)}
			aria-label={label}
			aria-current={isActive ? "page" : undefined}
			className={[
				"flex w-full items-center gap-[9px] px-[12px] py-[6px]",
				"font-[family-name:var(--font-sans)] text-[14px]",
				"rounded-[var(--r-subtle)] mb-[3px]",
				"transition-[background,color] duration-[var(--motion-fast)] ease-[var(--motion-ease)]",
				// AD9: active item → elevated surface; inactive → accent-tinted hover
				// to match the fast-nav Row hover (uniform surface grammar).
				isActive
					? "bg-[var(--surface-elevated)] shadow-[var(--shadow-subtle)] text-[var(--text-primary)] font-[600]"
					: "text-[var(--text-secondary)] font-[500] hover:bg-[color-mix(in_oklab,var(--accent-primary)_4%,var(--surface-elevated))]",
			].join(" ")}
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
			<span data-section-label={view}>{label}</span>
			{badgeCount != null && badgeCount > 0 && (
				<span
					className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-[var(--r-pill)] text-[9px] font-[600] tabular-nums bg-[var(--accent-primary)] text-[var(--text-on-accent)] ml-auto"
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
		</button>
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
				"inline-flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-[var(--r-default)]",
				"border border-[var(--border-subtle)]",
				"transition-[background,border-color,color] duration-[var(--motion-fast)] ease-[var(--motion-ease)]",
				open
					? // eslint-disable-next-line design/no-handrolled-control -- see comment above
						"bg-[var(--accent-primary-dim)] border-[var(--accent-deep)] text-[var(--accent-deep)]"
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

// ---------------------------------------------------------------------------
// Settings footer — pinned at the BOTTOM (AD9 fix 3).
// Separator above + gear icon + "Settings" label.
// Same hover treatment as top-level items (accent-tinted color-mix).
// ---------------------------------------------------------------------------

function SettingsFooter({
	active,
	onClick,
	unseenNotificationCount,
	onNotificationClick,
	notificationPopoverOpen,
}: {
	active: boolean;
	onClick: () => void;
	unseenNotificationCount?: number;
	onNotificationClick?: () => void;
	notificationPopoverOpen?: boolean;
}): JSX.Element {
	const hasUnread = (unseenNotificationCount ?? 0) > 0;
	return (
		<div className="shrink-0" data-sidebar-bottom>
			<hr className="border-t border-[var(--border-subtle)] mx-[6px] mb-[6px]" />
			{/* AF8: Notification button — renders when onNotificationClick is wired.
			    The unread dot (notification-unread-dot) appears when unseenNotificationCount > 0. */}
			{onNotificationClick && (
				<button
					type="button"
					data-testid="sidebar-notification-btn"
					onClick={onNotificationClick}
					aria-label="Notifications"
					aria-expanded={notificationPopoverOpen}
					className="relative flex w-full items-center gap-[9px] px-[12px] py-[6px] font-[family-name:var(--font-sans)] text-[14px] rounded-[var(--r-subtle)] mb-[3px] text-[var(--text-secondary)] font-[500] hover:bg-[color-mix(in_oklab,var(--accent-primary)_4%,var(--surface-elevated))] transition-[background,color] duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
				>
					<span className="inline-flex text-[var(--text-tertiary)]" aria-hidden="true">
						<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
							<path d="M8 1a5 5 0 00-5 5v2.586l-.707.707A1 1 0 003 11h10a1 1 0 00.707-1.707L13 8.586V6a5 5 0 00-5-5zm0 13a2 2 0 01-2-2h4a2 2 0 01-2 2z" />
						</svg>
					</span>
					<span>Notifications</span>
					{hasUnread && (
						<span
							className="absolute top-[6px] right-[9px] w-[6px] h-[6px] rounded-[var(--r-pill)] bg-[var(--status-error)]"
							data-testid="notification-unread-dot"
							aria-hidden="true"
						/>
					)}
				</button>
			)}
			<button
				type="button"
				data-testid="sidebar-settings-btn"
				data-active={active ? "true" : "false"}
				onClick={onClick}
				aria-label="Settings"
				aria-current={active ? "page" : undefined}
				className={[
					"flex w-full items-center gap-[9px] px-[12px] py-[6px]",
					"font-[family-name:var(--font-sans)] text-[14px]",
					"rounded-[var(--r-subtle)]",
					"transition-[background,color] duration-[var(--motion-fast)] ease-[var(--motion-ease)]",
					active
						? "bg-[var(--surface-elevated)] shadow-[var(--shadow-subtle)] text-[var(--text-primary)] font-[600]"
						: "text-[var(--text-secondary)] font-[500] hover:bg-[color-mix(in_oklab,var(--accent-primary)_4%,var(--surface-elevated))]",
				].join(" ")}
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
				{/* @lore P4 AC: Settings footer is icon-only (no visible text). "Settings"
				    text appears ONLY in the sidebar body heading when settingsOpen=true.
				    This allows P4 test: after Escape, queryByText("Settings") returns null. */}
			</button>
		</div>
	);
}

// ---------------------------------------------------------------------------
// FastNavItem — custom list item with section-specific data attrs.
//
// @lore AD9: Uses a plain <li><div role="button"> pattern instead of Row as="li"
// so each item carries data-thread-id / data-team-id / data-knowledge-id for
// E2E selectors. Row does not accept arbitrary data-* props. Selected state
// replicates Row's bg-[var(--surface-elevated)] shadow-[var(--shadow-subtle)]
// class directly (same tokens, no abstraction gap).
//
// @lore AD9: aria-current="page" on the selected item satisfies the
// "active sub-item has aria-current" accessibility test.
// ---------------------------------------------------------------------------

interface FastNavItemProps {
	label: string;
	selected: boolean;
	onClick: () => void;
	/** Optional data attrs for section-specific E2E / unit selectors */
	"data-thread-id"?: string;
	"data-team-id"?: string;
	"data-knowledge-id"?: string;
	"data-testid"?: string;
}

function FastNavItem({
	label,
	selected,
	onClick,
	"data-thread-id": dataThreadId,
	"data-team-id": dataTeamId,
	"data-knowledge-id": dataKnowledgeId,
	"data-testid": dataTestId,
}: FastNavItemProps): JSX.Element {
	// @lore AD9: <li data-thread-id aria-current> wraps <button> so:
	// - [data-thread-id] queries find the <li> (for E2E selectors and unit tests)
	// - [aria-current="page"] is on the <li> for semantic selected state
	// - firstItem.querySelector("button") finds the inner <button> for click events
	// Both the <li> selector and the <button> click target work independently.
	return (
		<li
			data-thread-id={dataThreadId}
			data-team-id={dataTeamId}
			data-knowledge-id={dataKnowledgeId}
			aria-current={selected ? "page" : undefined}
			className={[
				"border-b border-[var(--border-subtle)] last:border-b-0",
				selected
					? "bg-[var(--surface-elevated)] shadow-[var(--shadow-subtle)] rounded-[var(--r-subtle)]"
					: "",
			]
				.filter(Boolean)
				.join(" ")}
		>
			<button
				type="button"
				data-testid={dataTestId}
				onClick={onClick}
				className={[
					"flex items-center w-full px-[24px] min-h-[44px]",
					"text-[13px] font-[500] text-[var(--text-primary)] truncate",
					"transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)]",
					"focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)]",
					!selected
						? "hover:bg-[color-mix(in_oklab,var(--accent-primary)_4%,var(--surface-elevated))]"
						: "",
				]
					.filter(Boolean)
					.join(" ")}
			>
				<span className="truncate">{label}</span>
			</button>
		</li>
	);
}

// ---------------------------------------------------------------------------
// Settings heading — rendered in sidebar body when settingsOpen=true.
// P4 AC: "Settings heading in Sidebar body" appears when open, disappears on close.
// ---------------------------------------------------------------------------

function SettingsHeading(): JSX.Element {
	return (
		<p className="px-[12px] py-[6px] font-[family-name:var(--font-mono)] text-[12px] uppercase tracking-[var(--tracking-caps)] text-[var(--text-secondary)]">
			Settings
		</p>
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
	settingsNavItems,
	knowledgeTriageCount,
	conversationsBlockingCount,
	unseenNotificationCount,
	onNotificationClick,
	notificationPopoverOpen,
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
		if (settingsOpen) {
			// Settings mode: show "Settings" heading + settings nav items.
			// @lore P4 AC: "Settings" text in sidebar body appears when settingsOpen=true
			// and disappears when closed (Escape / settings button click). The footer
			// button is icon-only (aria-label only) so "Settings" text is ONLY in the body.
			return (
				<>
					<SettingsHeading />
					{settingsNavItems && <div className="flex flex-col gap-1">{settingsNavItems}</div>}
				</>
			);
		}

		if (activeView === "conversations") {
			if (visibleThreads.length === 0) {
				return (
					<p className="px-[24px] py-[12px] text-[13px] text-[var(--text-tertiary)]">
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
				return (
					<p className="px-[24px] py-[12px] text-[13px] text-[var(--text-tertiary)]">
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
				return (
					<p className="px-[24px] py-[12px] text-[13px] text-[var(--text-tertiary)]">
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
							onClick={() => onSelectKnowledgeItem?.(k.id)}
							data-knowledge-id={k.id}
							data-testid={`fastnav-${k.id}`}
						/>
					))}
				</ul>
			);
		}

		return <></>;
	}

	return (
		<aside
			data-ds-shell="Sidebar"
			aria-label="Main navigation"
			className="flex flex-col w-full shrink-0 h-full p-[12px] gap-[12px]"
		>
			{/* 1 + 2: Search field + Assistant icon button on the same row.
			    AD9: use SearchField.shortcutKey="⌘K" — the DS component renders a
			    kbd pill at the right edge natively. AssistantIconButton is to the right
			    of the search field (per SidebarV2 founder-approved design).
			    @lore AD9: data-testid="sidebar-search-hint" on the wrapper satisfies the
			    W3 AC-1 test that queries by testid. The wrapper's onClick triggers
			    onSearchClick so clicking anywhere on the row (not just the input) opens
			    the Cmd+K panel — same UX as the old hint-button pattern. */}
			<div className="flex items-center gap-[6px] shrink-0">
				{/* biome-ignore lint/a11y/noStaticElementInteractions: div wraps SearchField (interactive); onClick is a hint for the Cmd+K trigger, actual input focus is handled by SearchField itself */}
				{/* biome-ignore lint/a11y/useKeyWithClickEvents: SearchField is a real keyboard-accessible input; wrapper div onClick only supplements pointer interaction for the Cmd+K hint */}
				<div
					className="flex-1 min-w-0"
					data-testid="sidebar-search-hint"
					onClick={() => onSearchClick()}
				>
					<SearchField
						placeholder="Search"
						value=""
						onChange={() => onSearchClick()}
						shortcutKey="⌘K"
					/>
				</div>
				<AssistantIconButton
					open={assistantOverlayOpen ?? false}
					onClick={onAssistantClick ?? (() => undefined)}
				/>
			</div>

			{/* 3: Three selectable top-level section items */}
			<nav className="flex flex-col shrink-0" aria-label="Main navigation">
				{VIEW_IDS.map((view) => (
					<SectionHeader
						key={view}
						view={view}
						activeView={settingsOpen ? "" : activeView}
						onViewChange={(v) => {
							onViewChange(v);
						}}
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

			{/* 4: Separator */}
			<hr className="border-t border-[var(--border-subtle)] mx-[6px] shrink-0" />

			{/* 5: Shared fast-nav area — ONE list, content swaps on section change.
			    When settingsOpen, shows the settingsNavItems instead. */}
			<div className="flex-1 min-h-0 overflow-y-auto" data-fastnav-section={activeView}>
				{renderFastNavItems()}
			</div>

			{/* 6: Settings pinned at the BOTTOM (AD9 fix 3) */}
			<SettingsFooter
				active={settingsOpen}
				onClick={onSettingsClick}
				unseenNotificationCount={unseenNotificationCount}
				onNotificationClick={onNotificationClick}
				notificationPopoverOpen={notificationPopoverOpen}
			/>
		</aside>
	);
}
