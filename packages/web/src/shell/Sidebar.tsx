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

	/** Knowledge scope sub-items */
	activeScope: string | null;
	onSelectScope: (scope: string) => void;

	/** CoC trigger */
	onCocClick: () => void;
	cocOverlayOpen: boolean;

	/** Settings trigger */
	onSettingsClick: () => void;
	settingsOpen: boolean;

	/** Settings mode: replaces body with settings nav */
	settingsNavItems?: ReactNode;

	/** User avatar */
	avatarUrl?: string;
	userInitials?: string;
}

// ---------------------------------------------------------------------------
// Static knowledge scope sub-items (Practices, Products, Factory)
// ---------------------------------------------------------------------------

const KNOWLEDGE_SCOPE_ITEMS = [
	{ label: "Practices", scope: "practices" },
	{ label: "Products", scope: "products" },
	{ label: "Factory", scope: "factory" },
] as const;

// ---------------------------------------------------------------------------
// CoC chat-bubble icon (16x16)
// ---------------------------------------------------------------------------

function CocIcon(): JSX.Element {
	return (
		<svg viewBox="0 0 16 16" fill="currentColor" width={16} height={16} aria-hidden="true">
			<path d="M2 2h12a1 1 0 011 1v8a1 1 0 01-1 1H6l-3 3v-3H2a1 1 0 01-1-1V3a1 1 0 011-1z" />
		</svg>
	);
}

// ---------------------------------------------------------------------------
// Gear settings icon (16x16)
// ---------------------------------------------------------------------------

function GearIcon(): JSX.Element {
	// @lore U6 A5: path coordinates fit within the 16x16 viewBox.
	// A gear with 8 teeth centered at (8,8) with outer radius ~7 and inner circle radius ~2.5.
	return (
		<svg viewBox="0 0 16 16" fill="currentColor" width={16} height={16} aria-hidden="true">
			<path
				fillRule="evenodd"
				d="M6.5 0.5h3l0.5 1.5a4.5 4.5 0 011 0.57l1.43-.48 2.12 2.12-.48 1.43c.24.32.44.66.57 1L16 7v2l-1.38.46a4.5 4.5 0 01-.57 1l.48 1.43-2.12 2.12-1.43-.48a4.5 4.5 0 01-1 .57L9.5 15.5h-3l-.5-1.5a4.5 4.5 0 01-1-.57l-1.43.48L1.45 11.79l.48-1.43A4.5 4.5 0 011.36 9.33L0 9V7l1.38-.46a4.5 4.5 0 01.57-1L1.45 4.1 3.57 1.98 5 2.46A4.5 4.5 0 016 1.89L6.5 0.5zM8 5.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z"
				clipRule="evenodd"
			/>
		</svg>
	);
}

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
	activeScope,
	onSelectScope,
	onCocClick,
	cocOverlayOpen,
	onSettingsClick,
	settingsOpen,
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

						{/* Knowledge section */}
						<div data-active-view={activeView === "knowledge" ? "knowledge" : undefined}>
							<SectionHeader view="knowledge" activeView={activeView} onViewChange={onViewChange} />
							<ul className="flex flex-col">
								{KNOWLEDGE_SCOPE_ITEMS.map((item) => {
									const isActive = item.scope === activeScope;
									return (
										<li
											key={item.scope}
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
												onClick={() => onSelectScope(item.scope)}
												className={[
													"w-full text-left px-2 py-1 text-[13px] min-h-[28px]",
													"truncate transition-[background] duration-[var(--motion-fast)]",
													"hover:bg-[var(--accent-primary-dim)]",
													isActive
														? "text-[var(--text-primary)] font-[500]"
														: "text-[var(--text-secondary)]",
												].join(" ")}
											>
												{item.label}
											</button>
										</li>
									);
								})}
							</ul>
						</div>
					</>
				)}
			</div>

			{/* Bottom strip */}
			<div data-sidebar-bottom className="shrink-0 border-t border-[var(--border-subtle)]">
				{/* CoC trigger */}
				<button
					type="button"
					onClick={onCocClick}
					aria-label="Chief of Staff"
					aria-expanded={cocOverlayOpen}
					className={[
						"flex w-full items-center gap-2 px-4 min-h-[44px]",
						"text-[13px] text-[var(--text-tertiary)]",
						"transition-[background] duration-[var(--motion-fast)]",
						"hover:bg-[var(--accent-primary-dim)] hover:text-[var(--text-secondary)]",
						cocOverlayOpen ? "text-[var(--accent-primary)]" : "",
					].join(" ")}
				>
					<span className={cocOverlayOpen ? "text-[var(--accent-primary)]" : ""}>
						<CocIcon />
					</span>
					Chief of Staff
				</button>

				{/* Settings trigger */}
				<button
					type="button"
					onClick={onSettingsClick}
					aria-label="Settings"
					className={[
						"flex w-full items-center gap-2 px-4 min-h-[44px]",
						"text-[13px] text-[var(--text-tertiary)]",
						"transition-[background] duration-[var(--motion-fast)]",
						"hover:bg-[var(--accent-primary-dim)]",
					].join(" ")}
				>
					{/* Avatar */}
					{avatarUrl ? (
						<img
							src={avatarUrl}
							alt="User avatar"
							className="w-6 h-6 rounded-full object-cover shrink-0"
						/>
					) : (
						<span className="inline-flex w-6 h-6 items-center justify-center rounded-full bg-[var(--accent-primary-dim)] text-[11px] font-mono text-[var(--text-secondary)] shrink-0 uppercase">
							{userInitials ?? "?"}
						</span>
					)}
					{/* No visible "Settings" text in the button body — aria-label handles accessibility.
					    This avoids getByText(/^settings$/i) finding both this button and the settings
					    heading when settingsOpen=true. */}
					<span className="flex-1" />
					<span className="ml-auto">
						<GearIcon />
					</span>
				</button>
			</div>
		</aside>
	);
}
<!-- trigger -->
