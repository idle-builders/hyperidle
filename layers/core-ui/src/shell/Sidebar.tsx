// hearth-internal-padding
import type { JSX } from "react";
import { Link } from "react-router-dom";
import { Button, LiveDot, Row, Tag } from "../ds";
import type { ViewId } from "./shell-types";
import { VIEW_ICONS, VIEW_IDS } from "./shell-types";

const VIEW_HREFS: Record<ViewId, string> = {
	conversations: "/conversations",
	work: "/work",
	knowledge: "/documents",
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

export interface SidebarDocumentItem {
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

	/** Document items for the fast-nav list (head of /documents list) */
	documentItems?: ReadonlyArray<SidebarDocumentItem>;
	/** Handler for document item click */
	onSelectDocumentItem?: (id: string) => void;

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
	 * Count of threads with unresolved reviews (blocking).
	 * When > 0, a numeric badge renders adjacent to the Conversations header.
	 */
	conversationsBlockingCount?: number;

	/**
	 * Count of unseen notifications. When > 0, a red dot renders on the
	 * notification destination at the top of the stable switcher.
	 */
	unseenNotificationCount?: number;

	/**
	 * Handler for the notification trigger click (opens NotificationPopover).
	 */
	onNotificationClick?: () => void;

	/**
	 * Whether the NotificationPopover is currently open (for aria-expanded).
	 */
	notificationPopoverOpen?: boolean;

	/**
	 * When true, the fast-nav sub-list for the corresponding section is still
	 * loading. Suppresses the "No X yet" empty-state message so it doesn't flash
	 * during the initial fetch or after a 429/retry.
	 */
	threadsLoading?: boolean;
	teamsLoading?: boolean;
	documentsLoading?: boolean;

	/**
	 * When true, the API call for the corresponding section failed. Renders an
	 * honest "Couldn't load" message instead of the misleading "No X yet" empty
	 * state (which implies success with zero items).
	 */
	threadsError?: boolean;
	teamsError?: boolean;
	documentsError?: boolean;

	/** drawerMode — labels use hidden min-[769px]:inline; at 375px mobile viewport they'd hide inside the drawer; drawerMode overrides the breakpoint gate */
	drawerMode?: boolean;
}

// SectionHeader: active icon → --text-primary; inactive → --text-tertiary; hover uses accent-tinted color-mix

interface SectionHeaderProps {
	view: ViewId;
	activeView: ViewId | "";
	onViewChange: (view: ViewId) => void;
	/** Destination href for the section Link — nav items must be real links. */
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
	// A full-width sidebar nav row, same shape as the sibling SectionHeader
	// <Link> rows. Button's fixed-floor inline-control shape doesn't fit a
	// w-full row (and its radius is a fixed pill, not the 10px r-subtle the
	// sibling rows use), so this adopts Row itself instead — the actual
	// ds/ list-row primitive, not a hand-rolled lookalike. `rounded` is
	// Row's own small option for a standalone nav-style row outside a
	// bordered list (permanent radius, no separator); `aria-label`/
	// `aria-expanded` are Row's passthrough for a row that is a popover
	// trigger rather than a plain click target.
	return (
		<Row
			as="button"
			data-testid="sidebar-notification-btn"
			aria-label="Notifications"
			aria-expanded={open}
			rounded
			onClick={onClick}
			lead={
				<span className="text-[var(--text-tertiary)]" aria-hidden="true">
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
			}
			title={
				<span className={drawerMode ? "inline" : "hidden min-[769px]:inline"}>Notifications</span>
			}
			cells={
				hasUnread
					? [
							{
								content: (
									<span data-testid="notification-unread-dot">
										<LiveDot />
									</span>
								),
							},
						]
					: undefined
			}
		/>
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
				// Active item → elevated surface; inactive → accent-tinted hover
				// to match the fast-nav Row hover (uniform surface grammar).
				isActive
					? "bg-[var(--surface-elevated)] shadow-[var(--shadow-subtle)] text-[var(--text-primary)] "
					: "text-[var(--text-secondary)]  hover:bg-[color-mix(in_oklab,var(--accent-primary)_4%,var(--surface-elevated))]",
			].join(" ")}`}
		>
			{/* active → --text-primary; inactive → --text-tertiary */}
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
					className="ml-auto"
					data-testid={
						view === "knowledge"
							? "document-triage-badge"
							: view === "conversations"
								? "conversations-blocking-badge"
								: `${view}-blocking-badge`
					}
				>
					<Tag label={badgeCount > 99 ? "99+" : String(badgeCount)} tone="solid" />
				</span>
			)}
		</Link>
	);
}

function AssistantIconButton({
	open,
	onClick,
}: {
	open: boolean;
	onClick: () => void;
}): JSX.Element {
	return (
		<Button
			variant={open ? "secondary" : "ghost"}
			tone="neutral"
			size="icon"
			data-testid="sidebar-assistant-btn"
			onClick={onClick}
			aria-label="Assistant"
			aria-expanded={open}
		>
			{/* robot glyph; fillRule="evenodd" knocks out eye holes */}
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
		</Button>
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
			{/* Active → secondary (bg-surface-elevated/border/text-primary);
			    inactive → ghost tone="neutral" (transparent, text-secondary),
			    matching every other sidebar toggle icon. */}
			<Button
				variant={active ? "secondary" : "ghost"}
				tone="neutral"
				size="icon"
				data-testid="sidebar-settings-btn"
				data-active={active ? "true" : "false"}
				onClick={onClick}
				aria-label="Settings"
				aria-current={active ? "page" : undefined}
			>
				<span
					className={
						active
							? "inline-flex text-[var(--text-primary)]"
							: "inline-flex text-[var(--text-tertiary)]"
					}
					aria-hidden="true"
				>
					{/* Heroicons "cog-8-tooth" path (MIT), native 24 viewBox → 16px box. */}
					<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
						<path
							fillRule="evenodd"
							clipRule="evenodd"
							d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 4.889c-.02.12-.115.26-.297.348a7.493 7.493 0 00-.986.57c-.166.115-.334.126-.45.083L6.3 5.508a1.875 1.875 0 00-2.282.819l-.922 1.597a1.875 1.875 0 00.432 2.385l.84.692c.095.078.17.229.154.43a7.598 7.598 0 000 1.139c.015.2-.059.352-.153.43l-.841.692a1.875 1.875 0 00-.432 2.385l.922 1.597a1.875 1.875 0 002.282.818l1.019-.382c.115-.043.283-.031.45.082.312.214.641.405.985.57.182.088.277.228.297.35l.178 1.071c.151.904.933 1.567 1.85 1.567h1.844c.916 0 1.699-.663 1.85-1.567l.178-1.072c.02-.12.114-.26.297-.349.344-.165.673-.356.985-.57.167-.114.335-.125.45-.082l1.02.382a1.875 1.875 0 002.28-.819l.923-1.597a1.875 1.875 0 00-.432-2.385l-.84-.692c-.095-.078-.17-.229-.154-.43a7.614 7.614 0 000-1.139c-.016-.2.059-.352.153-.43l.84-.692c.708-.582.891-1.59.433-2.385l-.922-1.597a1.875 1.875 0 00-2.282-.818l-1.02.382c-.114.043-.282.031-.45-.082a7.49 7.49 0 00-.985-.57c-.182-.088-.276-.228-.297-.35l-.178-1.071a1.875 1.875 0 00-1.85-1.567h-1.843zM12 15.75a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z"
						/>
					</svg>
				</span>
			</Button>
		</nav>
	);
}

interface FastNavItemProps {
	label: string;
	selected: boolean;
	/** Destination href — makes the item a real link. */
	href: string;
	onClick?: () => void;
	/** Optional data attrs for section-specific E2E / unit selectors */
	"data-thread-id"?: string;
	"data-team-id"?: string;
	"data-document-id"?: string;
	"data-testid"?: string;
}

function FastNavItem({
	label,
	selected,
	href,
	onClick,
	"data-thread-id": dataThreadId,
	"data-team-id": dataTeamId,
	"data-document-id": dataDocumentId,
	"data-testid": dataTestId,
}: FastNavItemProps): JSX.Element {
	return (
		<li
			data-thread-id={dataThreadId}
			data-team-id={dataTeamId}
			data-document-id={dataDocumentId}
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
					"focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)] focus-visible:-outline-offset-1",
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

export function Sidebar({
	activeView,
	onViewChange,
	threads,
	selectedThreadId,
	onSelectThread,
	teams,
	activeTeamId,
	onSelectTeam,
	documentItems = [],
	onSelectDocumentItem,
	onAssistantClick,
	assistantOverlayOpen,
	onSettingsClick,
	settingsOpen,
	onSearchClick,
	conversationsBlockingCount,
	unseenNotificationCount,
	onNotificationClick,
	notificationPopoverOpen,
	threadsLoading,
	teamsLoading,
	documentsLoading,
	threadsError,
	teamsError,
	documentsError,
	drawerMode,
}: SidebarProps): JSX.Element {
	const visibleThreads = threads.slice(0, 5);

	const fastNavEmpty: Record<ViewId, string> = {
		conversations: "No threads yet",
		work: "No teams yet",
		knowledge: "No documents yet",
	};

	// Shared empty state empty message for non-active sections (shouldn't appear)
	const emptyMessage = fastNavEmpty[activeView];

	function renderFastNavItems(): JSX.Element | null {
		if (activeView === "conversations") {
			if (visibleThreads.length === 0) {
				// suppress empty message while initial fetch is in flight
				if (threadsLoading) return null;
				// honest error state — don't claim "No threads yet" when the API failed
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
			// 1 team: suppress sub-list — WorkOverview short-circuits straight to that team's page
			if (teams.length === 1) {
				return null;
			}
			const visibleTeams = teams;
			if (visibleTeams.length === 0) {
				// suppress empty message while initial fetch is in flight
				if (teamsLoading) return null;
				// honest error state — don't claim "No teams yet" when the API failed
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
			const visibleDocuments = documentItems.slice(0, 5);
			if (visibleDocuments.length === 0) {
				// suppress empty message while initial fetch is in flight
				if (documentsLoading) return null;
				// honest error state — don't claim "No documents yet" when the API failed
				if (documentsError) {
					return (
						<p className="type-small px-[24px] py-[12px]  text-[var(--text-tertiary)]">
							Couldn't load documents
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
					{visibleDocuments.map((k) => (
						<FastNavItem
							key={k.id}
							label={k.title}
							selected={false}
							href={`/documents/${encodeURIComponent(k.id)}`}
							onClick={() => onSelectDocumentItem?.(k.id)}
							data-document-id={k.id}
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
				{/* activeView="" at /settings — no domain section is active */}
				{VIEW_IDS.map((view) => (
					<SectionHeader
						key={view}
						view={view}
						activeView={settingsOpen ? "" : activeView}
						onViewChange={(v) => {
							onViewChange(v);
						}}
						href={VIEW_HREFS[view]}
						drawerMode={drawerMode}
						badgeCount={view === "conversations" ? conversationsBlockingCount : undefined}
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
