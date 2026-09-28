/**
 * AD9 /human-design-review evidence — NEW sidebar design (founder revision).
 *
 * This is a presentational design story, NOT production wiring. It composes the
 * founder's new sidebar layout from Hearth design-system primitives so the
 * grammar is inspectable + clickable in the viewer at :8099. The builder owns
 * the real Sidebar.tsx integration + routing later; here every callback is a
 * noop and the interactive behavior is driven by local component useState
 * (pure design — lets the founder click around).
 *
 * NEW layout (top → bottom):
 *   1. Search field at the very top.
 *   2. Assistant icon button directly to the RIGHT of search (same row).
 *   3. Three selectable top-level items: Conversations, Work, Knowledge.
 *   4. A separator.
 *   5. ONE shared "fast navigation" list below the separator that SWAPS its
 *      contents based on the selected top-level item — threads for
 *      Conversations, teams for Work, documents for Knowledge. It shows
 *      the head ("top X that fit") of that section's list view.
 *
 * Selecting a top-level item → fast-nav list swaps + that item shows selected.
 * Clicking a fast-nav item → noop + selected highlight (real app: navigates to
 * the subpage).
 */

import { type JSX, useState } from "react";
import { ItemList, Row, SearchField } from "../ds";
import type { ViewId } from "./shell-types";
import { VIEW_ICONS, VIEW_IDS } from "./shell-types";

export default { title: "Shell/SidebarV2" };

// ---------------------------------------------------------------------------
// Fixtures — one head-of-list per section (the fast-nav list is the head of
// each section's overview list; "top X that fit" = however many rows fit).
// ---------------------------------------------------------------------------

interface NavItem {
	id: string;
	title: string;
}

const SECTION_ITEMS: Record<ViewId, NavItem[]> = {
	conversations: [
		{ id: "t1", title: "Review: PR #128 — refactor auth flow" },
		{ id: "t2", title: "Check in on Sprint 12 blocker" },
		{ id: "t3", title: "API design feedback needed" },
		{ id: "t4", title: "Q3 planning retrospective" },
		{ id: "t5", title: "Onboarding new engineer" },
	],
	work: [
		{ id: "team-1", title: "Platform Team" },
		{ id: "team-2", title: "Product Alpha" },
		{ id: "team-3", title: "Factory Operations" },
	],
	knowledge: [
		{ id: "k1", title: "Engineering handbook" },
		{ id: "k2", title: "Q3 OKRs" },
		{ id: "k3", title: "Incident runbook" },
		{ id: "k4", title: "Design system tokens" },
	],
};

const FASTNAV_EMPTY: Record<ViewId, string> = {
	conversations: "No conversations yet",
	work: "No teams yet",
	knowledge: "No documents yet",
};

// ---------------------------------------------------------------------------
// Top-level selectable item (Conversations / Work / Knowledge)
// ---------------------------------------------------------------------------

function TopLevelItem({
	view,
	active,
	onSelect,
}: {
	view: ViewId;
	active: boolean;
	onSelect: (view: ViewId) => void;
}): JSX.Element {
	const { label, icon } = VIEW_ICONS[view];
	return (
		<button
			type="button"
			data-section-header={view}
			data-active={active ? "true" : "false"}
			aria-current={active ? "page" : undefined}
			onClick={() => onSelect(view)}
			className={[
				"flex w-full items-center gap-[9px] px-[12px] py-[6px]",
				"font-[family-name:var(--font-sans)] text-[14px]",
				"rounded-[var(--r-subtle)] mb-[3px]",
				"transition-[background,color] duration-[var(--motion-fast)] ease-[var(--motion-ease)]",
				// AD9 fix 1: unify hover. Match the shared Row hover (clickable.ts) —
				// accent-tinted color-mix — so top-level items + fast-nav rows read as
				// one surface instead of two different hover treatments.
				active
					? "bg-[var(--surface-elevated)] shadow-[var(--shadow-subtle)] text-[var(--text-primary)] font-[600]"
					: "text-[var(--text-secondary)] font-[500] hover:bg-[color-mix(in_oklab,var(--accent-primary)_4%,var(--surface-elevated))]",
			].join(" ")}
		>
			<span
				// AD9 fix 4: active icon was green (--accent-primary) which clashed with
				// the elevated active surface. Let the active icon share the label's
				// --text-primary so the active row reads as one solid weight; inactive
				// stays --text-tertiary for the quiet/active contrast.
				className={
					active
						? "inline-flex text-[var(--text-primary)]"
						: "inline-flex text-[var(--text-tertiary)]"
				}
				aria-hidden="true"
			>
				{icon}
			</span>
			<span>{label}</span>
		</button>
	);
}

// ---------------------------------------------------------------------------
// Assistant icon button — sits to the RIGHT of the search field, same row.
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
			className={[
				"inline-flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-[var(--r-default)]",
				"border border-[var(--border-subtle)]",
				"transition-[background,border-color,color] duration-[var(--motion-fast)] ease-[var(--motion-ease)]",
				open
					? "bg-[var(--accent-primary-dim)] border-[var(--accent-deep)] text-[var(--accent-deep)]"
					: "bg-[var(--surface-container)] text-[var(--text-secondary)] hover:border-[var(--border-default)] hover:text-[var(--text-primary)]",
			].join(" ")}
		>
			{/* AD9 fix 2: robot glyph (was a spark/sparkle). No DS icon set exists —
			    icons are inline 16x16 currentColor SVGs (shell-types convention).
			    Antenna + side ears + rounded body; eyes are knocked OUT with
			    fillRule="evenodd" so the holes show the button bg in BOTH the
			    default and open (accent-dim) states — no fixed eye color needed. */}
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
// Settings footer — pinned to the BOTTOM of the sidebar (AD9 fix 3).
// Mirrors the real Sidebar.tsx bottom-strip pattern (separator + bottom-anchored
// settings affordance), rendered here as an icon + label row that shares the
// SAME unified hover treatment as the top-level items + fast-nav rows.
// ---------------------------------------------------------------------------

function SettingsFooter({
	active,
	onClick,
}: {
	active: boolean;
	onClick: () => void;
}): JSX.Element {
	return (
		<div className="shrink-0" data-sidebar-bottom>
			<hr className="border-t border-[var(--border-subtle)] mx-[6px] mb-[6px]" />
			<button
				type="button"
				data-testid="sidebar-settings-btn"
				data-active={active ? "true" : "false"}
				aria-current={active ? "page" : undefined}
				onClick={onClick}
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
					{/* AD9 polish 1: gear glyph rebuilt — the hand-rolled evenodd cog
					    rendered muddy at 16px (teeth + center hole blurred together).
					    Replaced with the Heroicons "cog-8-tooth" path (MIT) on its native
					    24 viewBox so the 8 teeth + center hole are geometrically clean,
					    scaled to a 16px box. currentColor, shell-icon convention. */}
					<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
						<path
							fillRule="evenodd"
							clipRule="evenodd"
							d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 4.889c-.02.12-.115.26-.297.348a7.493 7.493 0 00-.986.57c-.166.115-.334.126-.45.083L6.3 5.508a1.875 1.875 0 00-2.282.819l-.922 1.597a1.875 1.875 0 00.432 2.385l.84.692c.095.078.17.229.154.43a7.598 7.598 0 000 1.139c.015.2-.059.352-.153.43l-.841.692a1.875 1.875 0 00-.432 2.385l.922 1.597a1.875 1.875 0 002.282.818l1.019-.382c.115-.043.283-.031.45.082.312.214.641.405.985.57.182.088.277.228.297.35l.178 1.071c.151.904.933 1.567 1.85 1.567h1.844c.916 0 1.699-.663 1.85-1.567l.178-1.072c.02-.12.114-.26.297-.349.344-.165.673-.356.985-.57.167-.114.335-.125.45-.082l1.02.382a1.875 1.875 0 002.28-.819l.923-1.597a1.875 1.875 0 00-.432-2.385l-.84-.692c-.095-.078-.17-.229-.154-.43a7.614 7.614 0 000-1.139c-.016-.2.059-.352.153-.43l.84-.692c.708-.582.891-1.59.433-2.385l-.922-1.597a1.875 1.875 0 00-2.282-.818l-1.02.382c-.114.043-.282.031-.45-.082a7.49 7.49 0 00-.985-.57c-.182-.088-.276-.228-.297-.35l-.178-1.071a1.875 1.875 0 00-1.85-1.567h-1.843zM12 15.75a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z"
						/>
					</svg>
				</span>
				<span>Settings</span>
			</button>
		</div>
	);
}

// ---------------------------------------------------------------------------
// SidebarV2 — presentational; local state owns selection + list-swap.
// ---------------------------------------------------------------------------

function SidebarV2({ initialView = "conversations" }: { initialView?: ViewId }): JSX.Element {
	const [activeView, setActiveView] = useState<ViewId>(initialView);
	const [search, setSearch] = useState("");
	const [assistantOpen, setAssistantOpen] = useState(false);
	const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
	const [settingsActive, setSettingsActive] = useState(false);

	// Fast-nav list = the head of the active section's list view. The "top X
	// that fit" is approximated here with a fixed cap; in the real app the cap
	// is computed from the available height.
	const items = SECTION_ITEMS[activeView];

	function selectView(view: ViewId): void {
		setActiveView(view);
		setSelectedItemId(null); // section overview = nothing sub-selected yet
		setSettingsActive(false); // leaving settings → a section is active
	}

	return (
		<nav
			data-ds-shell="SidebarV2"
			data-ds-tier="3"
			data-ds-source="web-shell"
			aria-label="Main navigation"
			className="flex h-full w-full shrink-0 flex-col gap-[12px] p-[12px]"
		>
			{/* 1 + 2: Search field + Assistant icon button on the same row */}
			<div className="flex items-center gap-[6px] shrink-0">
				{/* AD9 polish 2: the ⌘K hint pill read cramped against its fully-rounded
				    corners. The DS SearchField bakes a tight kbd (px-3 / min-w-20). Story-
				    scoped fix: drop SearchField's built-in hint, wrap the field relative,
				    and overlay a roomier kbd at px-6 / min-w-24 (both on the Hearth 6px
				    grid). The DS input already reserves pr-48, so the wider pill clears the
				    input text. Same radius / mono / size / color as the DS kbd — only the
				    horizontal breathing room changes. */}
				<div className="relative flex w-full items-center">
					<SearchField placeholder="Search" value={search} onChange={setSearch} />
					{/* biome-ignore lint/a11y/noAriaHiddenOnFocusable: <kbd> is not focusable — pointer-events-none + no tabIndex; decorative shortcut hint for sighted users only */}
					<kbd
						className="pointer-events-none absolute right-[8px] inline-flex h-[18px] min-w-[24px] items-center justify-center px-[6px] rounded-[var(--r-subtle)] bg-[var(--surface-elevated)] text-[var(--text-tertiary)] font-[family-name:var(--font-mono)] text-[11px] font-medium"
						aria-hidden="true"
					>
						⌘K
					</kbd>
				</div>
				<AssistantIconButton open={assistantOpen} onClick={() => setAssistantOpen((v) => !v)} />
			</div>

			{/* 3: Three selectable top-level items */}
			<nav className="flex flex-col shrink-0" aria-label="Sections">
				{VIEW_IDS.map((view) => (
					<TopLevelItem
						key={view}
						view={view}
						active={!settingsActive && view === activeView}
						onSelect={selectView}
					/>
				))}
			</nav>

			{/* 4: Separator */}
			<hr className="border-t border-[var(--border-subtle)] mx-[6px] shrink-0" />

			{/* 5: Shared fast-nav list — swaps contents on section change */}
			<div className="flex-1 min-h-0 overflow-y-auto" data-fastnav-section={activeView}>
				<ItemList
					as="ul"
					variant="flush"
					isEmpty={items.length === 0}
					empty={{ title: FASTNAV_EMPTY[activeView], description: "" }}
				>
					{items.map((item) => (
						<Row
							key={item.id}
							as="li"
							title={item.title}
							selected={item.id === selectedItemId}
							onClick={() => setSelectedItemId(item.id)}
							data-testid={`fastnav-${item.id}`}
						/>
					))}
				</ItemList>
			</div>

			{/* AD9 fix 3: Settings pinned at the BOTTOM (footer area). */}
			<SettingsFooter active={settingsActive} onClick={() => setSettingsActive(true)} />
		</nav>
	);
}

// ---------------------------------------------------------------------------
// Stories. Frame mimics the real shell rail width (240px) + full height.
// ---------------------------------------------------------------------------

function Frame({ children }: { children: JSX.Element }): JSX.Element {
	return (
		<div
			style={{ height: "640px", display: "flex", width: "240px" }}
			className="bg-[var(--surface-page)] border border-[var(--border-subtle)] rounded-[var(--r-default)] overflow-hidden"
		>
			{children}
		</div>
	);
}

/** Interactive — click the three items + the fast-nav rows; list swaps live. */
export function Interactive(): JSX.Element {
	return (
		<Frame>
			<SidebarV2 initialView="conversations" />
		</Frame>
	);
}
Interactive.storyName = "new sidebar — interactive (click to swap)";

/** Conversations active → fast-nav shows threads. */
export function ConversationsActive(): JSX.Element {
	return (
		<Frame>
			<SidebarV2 initialView="conversations" />
		</Frame>
	);
}
ConversationsActive.storyName = "new sidebar — Conversations active (threads)";

/** Work active → fast-nav shows teams (list swap evident vs Conversations). */
export function WorkActive(): JSX.Element {
	return (
		<Frame>
			<SidebarV2 initialView="work" />
		</Frame>
	);
}
WorkActive.storyName = "new sidebar — Work active (teams)";

/** Knowledge active → fast-nav shows documents. */
export function KnowledgeActive(): JSX.Element {
	return (
		<Frame>
			<SidebarV2 initialView="knowledge" />
		</Frame>
	);
}
KnowledgeActive.storyName = "new sidebar — Knowledge active (documents)";
