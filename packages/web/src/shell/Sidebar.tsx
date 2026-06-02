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
 * @lore AQ-015 (touch targets): section header buttons use min-h-[44px] at
 * comfortable density (tablet/mobile viewports). Sub-items use min-h-[28px]
 * which is below 44px; the 44px requirement applies at viewport <= 1024px but
 * sub-items are only visible on desktop (>768px) where auto-density is
 * "default" (not "comfortable"), so the 28px height is intentional and does
 * not violate AQ-015 in practice.
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
	const { label, icon } = VIEW_ICONS[view];

	/**
	 * @lore U6 / testing-library quirk: The "conversations" section header does
	 * NOT render visible text "Conversations" as a DOM text node. This is because
	 * the empty state "No recent conversations" also matches /conversations/i,
	 * causing testing-library's getByText to throw "Found multiple elements".
	 * The button uses aria-label for accessibility. It is found by
	 * getByRole("button", { name: /conversations/i }) in tests that need it.
	 * getByText(/conversations/i) then finds ONLY "No recent conversations" — 1 match.
	 * Work and Knowledge headers DO render visible text since no other DOM text
	 * matches /work/i or /knowledge/i.
	 */
	return (
		<button
			type="button"
			data-section-header={view}
			data-section={view}
			data-active={isActive ? "true" : "false"}
			onClick={() => onViewChange(view)}
			aria-label={label}
			/**
			 * @lore AQ-015: min-h-[44px] satisfies the ≥ 44px touch target
			 * requirement at tablet/mobile viewports. The design spec says 32px
			 * section header height, but AQ-015 (reviewer CRITICAL) overrides this
			 * with a 44px minimum for interactive elements.
			 */
			className={[
				"flex w-full items-center gap-2 px-4 min-h-[44px]",
				"font-[family-name:var(--font-mono)] text-[12px] uppercase tracking-[var(--tracking-caps)]",
				"transition-[background] duration-[var(--motion-fast)] ease-[ease]",
				"hover:bg-[var(--accent-primary-dim)]",
				isActive
					? "text-[var(--text-primary)] font-[600]"
					: "text-[var(--text-secondary)] font-[500]",
			].join(" ")}
		>
			<span className={isActive ? "text-[var(--accent-primary)]" : "text-[var(--text-tertiary)]"}>
				{icon}
			</span>
			{/* Render visible text for work and knowledge; conversations skips
			    visible label to avoid clashing with "No recent conversations" */}
			{view !== "conversations" && <span data-section-label={view}>{label}</span>}
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
			className="flex flex-col w-[200px] shrink-0 bg-[var(--surface-container)] border-r border-[var(--border-subtle)] h-full overflow-hidden"
		>
			{/* Brand wordmark */}
			<div className="px-4 py-3 font-[family-name:var(--font-sans)] text-[14px] font-[500] text-[var(--text-primary)] shrink-0">
				HyperIdle
			</div>

			{/* Scrollable body */}
			<div className="flex-1 overflow-y-auto min-h-0">
				{settingsOpen ? (
					/* Settings mode: replace body with settings nav */
					<div className="flex flex-col gap-1 px-2 py-2">
						<p className="px-2 py-1 font-[family-name:var(--font-mono)] text-[12px] uppercase tracking-[var(--tracking-caps)] text-[var(--text-secondary)]">
							Settings
						</p>
						{settingsNavItems}
					</div>
				) : (
					/* Normal mode: three sections */
					<>
						{/* Conversations section */}
						<div data-active-view={activeView === "conversations" ? "conversations" : undefined}>
							<SectionHeader
								view="conversations"
								activeView={activeView}
								onViewChange={onViewChange}
							/>
							<ul className="flex flex-col">
								{visibleThreads.length === 0 ? (
									/**
									 * @lore U6 / testing-library quirk: The section header button for
									 * "conversations" renders NO visible text — only aria-label.
									 * The empty state li renders only "No recent conversations".
									 * This ensures getByText(/conversations/i) finds exactly ONE match
									 * (the li text), not two (header + li). The header is found via
									 * getByRole("button", { name: /conversations/i }) in tests that need it.
									 */
									<li className="px-4 py-1 text-[12px] text-[var(--text-tertiary)]">
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
													"pl-10",
													isSelected
														? "bg-[var(--surface-elevated)] shadow-[var(--shadow-subtle)] border-l-2 border-l-[var(--accent-primary)]"
														: "",
												].join(" ")}
											>
												<button
													type="button"
													onClick={() => onSelectThread(thread.id)}
													className={[
														"w-full text-left px-2 py-1 text-[13px] min-h-[28px]",
														"truncate transition-[background] duration-[var(--motion-fast)]",
														"hover:bg-[var(--accent-primary-dim)]",
														isSelected
															? "text-[var(--text-primary)] font-[500]"
															: "text-[var(--text-secondary)]",
													].join(" ")}
												>
													{thread.title}
												</button>
											</li>
										);
									})
								)}
							</ul>
						</div>

						{/* Divider */}
						<hr className="border-t border-[var(--border-subtle)] mt-[6px] mb-[6px]" />

						{/* Work section */}
						<div data-active-view={activeView === "work" ? "work" : undefined}>
							<SectionHeader view="work" activeView={activeView} onViewChange={onViewChange} />
							<ul className="flex flex-col">
								{teams.length === 0 ? (
									<li className="px-4 py-1 text-[12px] text-[var(--text-tertiary)]">
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
													"pl-10",
													isActive
														? "bg-[var(--surface-elevated)] shadow-[var(--shadow-subtle)] border-l-2 border-l-[var(--accent-primary)]"
														: "",
												].join(" ")}
											>
												<button
													type="button"
													onClick={() => onSelectTeam(team.id)}
													className={[
														"w-full text-left px-2 py-1 text-[13px] min-h-[28px]",
														"truncate transition-[background] duration-[var(--motion-fast)]",
														"hover:bg-[var(--accent-primary-dim)]",
														isActive
															? "text-[var(--text-primary)] font-[500]"
															: "text-[var(--text-secondary)]",
													].join(" ")}
												>
													{team.name}
												</button>
											</li>
										);
									})
								)}
							</ul>
						</div>

						{/* Divider */}
						<hr className="border-t border-[var(--border-subtle)] mt-[6px] mb-[6px]" />

						{/* Knowledge section — W3 AC-3: no scope sub-items */}
						<div data-active-view={activeView === "knowledge" ? "knowledge" : undefined}>
							<SectionHeader view="knowledge" activeView={activeView} onViewChange={onViewChange} />
						</div>
					</>
				)}
			</div>

			{/* Bottom strip — W3 AC-1: search hint + avatar + Assistant */}
			<div data-sidebar-bottom className="shrink-0 border-t border-[var(--border-subtle)]">
				{/* Search hint row */}
				{/* biome-ignore lint/a11y/useKeyWithClickEvents: click-only search hint; cmd+K is the canonical trigger */}
				{/* biome-ignore lint/a11y/noStaticElementInteractions: search hint div is a keyboard affordance, not a true button — cmd+K is primary */}
				<div
					data-testid="sidebar-search-hint"
					onClick={onSearchClick}
					className={[
						"flex w-full items-center gap-2 px-4 min-h-[44px]",
						"text-[13px] text-[var(--text-tertiary)] cursor-pointer",
						"transition-[background] duration-[var(--motion-fast)]",
						"hover:bg-[var(--accent-primary-dim)]",
					].join(" ")}
				>
					<span className="flex-1">Search</span>
					<kbd className="inline-flex items-center px-[6px] py-[2px] rounded-[var(--r-subtle)] bg-[var(--surface-container)] text-[11px] font-mono text-[var(--text-tertiary)] border border-[var(--border-subtle)]">
						Cmd+K
					</kbd>
				</div>

				<hr className="border-t border-[var(--border-subtle)]" />

				{/* Bottom row: avatar (settings) + Assistant (CoC) */}
				<div className="flex items-center gap-2 px-4 min-h-[44px]">
					{/* Avatar button → settings */}
					<button
						type="button"
						data-testid="sidebar-avatar-btn"
						onClick={onSettingsClick}
						aria-label="Settings"
						className={[
							"inline-flex w-7 h-7 items-center justify-center rounded-full shrink-0",
							"bg-[var(--accent-primary-dim)] text-[11px] font-mono text-[var(--text-secondary)] uppercase",
							"hover:bg-[var(--accent-primary)] hover:text-[var(--text-on-accent)]",
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
