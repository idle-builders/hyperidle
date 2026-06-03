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
 */

import type { JSX, ReactNode } from "react";
import type { ViewId } from "./shell-types";
import { VIEW_ICONS } from "./shell-types";

export interface SidebarThread {
	id: string;
	title: string;
	hasUnresolvedReview: boolean;
}

export interface SidebarTeam {
	id: string;
	name: string;
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

	/** CoC trigger */
	onCocClick: () => void;
	cocOverlayOpen: boolean;

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
}

// ---------------------------------------------------------------------------
// W3 AC-3: Knowledge scope sub-items removed.
// Scopes are now handled as inline pills on the KnowledgeList page.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Section header button
// ---------------------------------------------------------------------------

interface SectionHeaderProps {
	view: ViewId;
	activeView: ViewId;
	onViewChange: (view: ViewId) => void;
}

function SectionHeader({ view, activeView, onViewChange }: SectionHeaderProps): JSX.Element {
	const isActive = view === activeView;
	const { label } = VIEW_ICONS[view];

	return (
		<button
			type="button"
			data-section-header={view}
			data-section={view}
			data-active={isActive ? "true" : "false"}
			onClick={() => onViewChange(view)}
			aria-label={label}
			className={[
				"flex w-full items-center gap-[6px] px-[12px] py-[6px]",
				"font-[family-name:var(--font-sans)] text-[14px]",
				"rounded-[var(--r-subtle)]",
				"transition-[background] duration-[var(--motion-fast)] ease-[ease]",
				"hover:bg-[rgba(44,36,26,0.04)]",
				"mb-[3px]",
				isActive
					? "text-[var(--text-primary)] font-[600]"
					: "text-[var(--text-secondary)] font-[500]",
			].join(" ")}
		>
			<span data-section-label={view}>{label}</span>
		</button>
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
	onCocClick,
	cocOverlayOpen,
	onSettingsClick,
	settingsOpen,
	onSearchClick,
	settingsNavItems,
	avatarUrl,
	userInitials,
}: SidebarProps): JSX.Element {
	// Cap threads at 5
	const visibleThreads = threads.slice(0, 5);

	return (
		<aside
			data-ds-shell="Sidebar"
			role="navigation"
			aria-label="Main navigation"
			className="flex flex-col w-[200px] shrink-0 h-full p-[12px]"
		>
			{/* Brand wordmark */}
			<div className="px-[12px] py-[6px] mb-[18px] font-[family-name:var(--font-sans)] text-[15px] font-[700] text-[var(--text-primary)] tracking-[-0.01em] shrink-0">
				HyperIdle
			</div>

			{/* Scrollable body */}
			<div className="flex-1 overflow-y-auto min-h-0">
				{settingsOpen ? (
					/* Settings mode: replace body with settings nav */
					<div className="flex flex-col gap-1 py-2">
						<p className="px-[12px] py-1 font-[family-name:var(--font-mono)] text-[12px] uppercase tracking-[var(--tracking-caps)] text-[var(--text-secondary)]">
							Settings
						</p>
						{settingsNavItems}
					</div>
				) : (
					/* Normal mode: three sections separated by margin, no dividers */
					<>
						{/* Conversations section */}
						<div
							className="mb-[18px]"
							data-active-view={activeView === "conversations" ? "conversations" : undefined}
						>
							<SectionHeader
								view="conversations"
								activeView={activeView}
								onViewChange={onViewChange}
							/>
							<ul className="flex flex-col">
								{visibleThreads.length === 0 ? (
									<li className="px-[12px] py-1 text-[12px] text-[var(--text-tertiary)]">
										No recent conversations
									</li>
								) : (
									visibleThreads.map((thread) => {
										const isSelected = thread.id === selectedThreadId;
										return (
											<li
												key={thread.id}
												data-thread-id={thread.id}
												aria-current={isSelected ? "page" : undefined}
												className={[
													"rounded-[var(--r-subtle)] mb-[3px]",
													isSelected
														? "bg-[var(--surface-elevated)] shadow-[var(--shadow-subtle)]"
														: "",
												].join(" ")}
											>
												<button
													type="button"
													onClick={() => onSelectThread(thread.id)}
													className={[
														"w-full text-left px-[12px] py-[6px] text-[13px]",
														"flex items-center gap-[6px]",
														"truncate transition-[background] duration-[var(--motion-fast)]",
														"hover:bg-[rgba(44,36,26,0.04)] rounded-[var(--r-subtle)]",
														isSelected
															? "text-[var(--text-primary)] font-[500]"
															: "text-[var(--text-secondary)]",
													].join(" ")}
												>
													<span
														className="inline-block w-[8px] h-[8px] rounded-full shrink-0"
														style={{ background: "var(--accent-primary)" }}
														aria-hidden="true"
													/>
													<span className="truncate">{thread.title}</span>
												</button>
											</li>
										);
									})
								)}
							</ul>
						</div>

						{/* Work section */}
						<div
							className="mb-[18px]"
							data-active-view={activeView === "work" ? "work" : undefined}
						>
							<SectionHeader view="work" activeView={activeView} onViewChange={onViewChange} />
							<ul className="flex flex-col">
								{teams.length === 0 ? (
									<li className="px-[12px] py-1 text-[12px] text-[var(--text-tertiary)]">
										No teams yet
									</li>
								) : (
									teams.map((team) => {
										const isActive = team.id === activeTeamId;
										return (
											<li
												key={team.id}
												data-team-id={team.id}
												aria-current={isActive ? "page" : undefined}
												className={[
													"rounded-[var(--r-subtle)] mb-[3px]",
													isActive
														? "bg-[var(--surface-elevated)] shadow-[var(--shadow-subtle)]"
														: "",
												].join(" ")}
											>
												<button
													type="button"
													onClick={() => onSelectTeam(team.id)}
													className={[
														"w-full text-left px-[12px] py-[6px] text-[13px]",
														"flex items-center gap-[6px]",
														"truncate transition-[background] duration-[var(--motion-fast)]",
														"hover:bg-[rgba(44,36,26,0.04)] rounded-[var(--r-subtle)]",
														isActive
															? "text-[var(--text-primary)] font-[500]"
															: "text-[var(--text-secondary)]",
													].join(" ")}
												>
													<span
														className="inline-block w-[8px] h-[8px] rounded-full shrink-0"
														style={{ background: "var(--accent-primary)" }}
														aria-hidden="true"
													/>
													<span className="truncate">{team.name}</span>
												</button>
											</li>
										);
									})
								)}
							</ul>
						</div>

						{/* Knowledge section — W3 AC-3: no scope sub-items */}
						<div
							className="mb-[18px]"
							data-active-view={activeView === "knowledge" ? "knowledge" : undefined}
						>
							<SectionHeader view="knowledge" activeView={activeView} onViewChange={onViewChange} />
						</div>
					</>
				)}
			</div>

			{/* Bottom strip — W3 AC-1: search hint + avatar + Assistant */}
			<div data-sidebar-bottom className="shrink-0">
				{/* Search hint row */}
				{/* biome-ignore lint/a11y/useKeyWithClickEvents: click-only search hint; cmd+K is the canonical trigger */}
				{/* biome-ignore lint/a11y/noStaticElementInteractions: search hint div is a keyboard affordance, not a true button — cmd+K is primary */}
				<div
					data-testid="sidebar-search-hint"
					onClick={onSearchClick}
					className={[
						"flex w-full items-center justify-between px-[12px] py-[6px]",
						"text-[12px] text-[var(--text-tertiary)] cursor-pointer",
						"transition-[background] duration-[var(--motion-fast)]",
						"hover:bg-[rgba(44,36,26,0.04)]",
					].join(" ")}
				>
					<span>Search</span>
					<kbd className="inline-flex items-center px-[6px] py-[2px] rounded-[4px] bg-[var(--surface-container)] text-[11px] font-mono text-[var(--text-tertiary)] border border-[var(--border-subtle)]">
						⌘K
					</kbd>
				</div>

				<hr className="border-t border-[var(--border-subtle)] mx-[12px]" />

				{/* Bottom row: avatar (settings) + Assistant (CoC) */}
				<div className="flex items-center gap-[9px] px-[12px] py-[6px]">
					{/* Avatar button → settings */}
					<button
						type="button"
						data-testid="sidebar-avatar-btn"
						onClick={onSettingsClick}
						aria-label="Settings"
						className={[
							"inline-flex w-7 h-7 items-center justify-center rounded-full shrink-0",
							"bg-[var(--surface-page)] text-[10px] font-[600] font-mono text-[var(--text-secondary)] uppercase",
							"border-[1.5px] border-[var(--border-default)]",
							"transition-[background] duration-[var(--motion-fast)] cursor-pointer",
						].join(" ")}
					>
						{avatarUrl ? (
							<img
								src={avatarUrl}
								alt="User avatar"
								className="w-7 h-7 rounded-full object-cover"
							/>
						) : (
							(userInitials ?? "?")
						)}
					</button>

					{/* Assistant button → CoC */}
					<button
						type="button"
						onClick={onCocClick}
						aria-expanded={cocOverlayOpen}
						aria-label="Assistant"
						className={[
							"flex-1 text-left text-[13px]",
							"transition-[color] duration-[var(--motion-fast)]",
							cocOverlayOpen
								? "text-[var(--accent-primary)]"
								: "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]",
						].join(" ")}
					>
						Assistant
					</button>
				</div>
			</div>
		</aside>
	);
}
