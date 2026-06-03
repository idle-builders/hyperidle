import {
	BetCard,
	EmptyState,
	ErrorState,
	KnowledgeRow,
	SearchField,
	ThreadRow,
} from "@hyperidle/design-system";
import FocusTrap from "focus-trap-react";
import { type JSX, useCallback, useEffect, useMemo, useRef } from "react";
import { useGlobalSearch } from "../hooks/useGlobalSearch";
import { useKeyboardNavigation } from "../hooks/useKeyboardNavigation";

type ResultType = "conversation" | "work" | "knowledge";

export interface GlobalSearchPanelProps {
	open: boolean;
	onClose: () => void;
	onNavigate: (type: ResultType, id: string) => void;
}

interface FlatItem {
	type: ResultType;
	id: string;
}

/**
 * @lore GlobalSearchPanel is a composition panel that assembles Tier 1/2 components
 * (SearchField, ThreadRow, BetCard, KnowledgeRow) and DaisyUI primitives. It is NOT
 * one of the 19 custom components in the component budget — it is a page-level
 * composition, similar to how a page assembles components without being a component itself.
 */

/**
 * @lore DaisyUI modal pattern uses CSS classes (modal modal-open) instead of
 * the <dialog> element so we have full control over focus and keyboard events
 * without fighting the native dialog behavior.
 */

const AVATAR_PLACEHOLDER =
	"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Crect width='32' height='32' fill='%23374151'/%3E%3C/svg%3E";

export function GlobalSearchPanel({
	open,
	onClose,
	onNavigate,
}: GlobalSearchPanelProps): JSX.Element | null {
	const search = useGlobalSearch();
	const prevOpenRef = useRef(open);

	// Clear search state when panel closes and reopens
	useEffect(() => {
		if (open && !prevOpenRef.current) {
			search.clear();
		}
		prevOpenRef.current = open;
	}, [open, search]);

	// Build flat item list for keyboard navigation
	const flatItems = useMemo<FlatItem[]>(() => {
		const items: FlatItem[] = [];
		for (const c of search.results.conversations) {
			items.push({ type: "conversation", id: c.id });
		}
		for (const w of search.results.work) {
			items.push({ type: "work", id: w.id });
		}
		for (const k of search.results.knowledge) {
			items.push({ type: "knowledge", id: k.id });
		}
		return items;
	}, [search.results.conversations, search.results.work, search.results.knowledge]);

	const flatItemsRef = useRef(flatItems);
	flatItemsRef.current = flatItems;

	const handleSelect = useCallback(
		(index: number): void => {
			const item = flatItemsRef.current[index];
			if (item) {
				onNavigate(item.type, item.id);
			}
		},
		[onNavigate],
	);

	const nav = useKeyboardNavigation({
		itemCount: flatItems.length,
		onSelect: handleSelect,
		onClose,
	});

	/**
	 * @lore Ref callback focuses the input when the panel mounts.
	 * Cannot use autoFocus because biome's noAutofocus rule forbids it.
	 * Ref callback is the recommended alternative for programmatic focus.
	 */
	const focusRef = useCallback((node: HTMLInputElement | null): void => {
		node?.focus();
	}, []);

	if (!open) {
		return null;
	}

	const handleKeyDown = (e: React.KeyboardEvent): void => {
		nav.onKeyDown(e.nativeEvent);
	};

	const hasQuery = search.query.length > 0;
	const showEmptyState = hasQuery && !search.loading && !search.hasResults && !search.error;

	let itemIndex = 0;

	return (
		<div
			className="modal modal-open z-50"
			role="dialog"
			aria-modal="true"
			aria-label="Global search"
			onKeyDown={handleKeyDown}
		>
			{/**
			 * @lore focus-trap-react requires tabbableOptions.displayCheck="none" in jsdom
			 * because jsdom doesn't implement CSS visibility/display checks. The fallbackFocus
			 * ensures activation succeeds even when jsdom cannot detect tabbable nodes.
			 */}
			<FocusTrap
				focusTrapOptions={{
					initialFocus: false,
					allowOutsideClick: true,
					fallbackFocus: ".modal-box",
					tabbableOptions: { displayCheck: "none" },
				}}
			>
				<div className="modal-box max-w-[640px] p-3 flex flex-col gap-2 max-h-[80vh]">
					<SearchField
						placeholder="Search conversations, work, knowledge..."
						value={search.query}
						onChange={search.setQuery}
						loading={search.loading}
						shortcutKey="K"
						ref={focusRef}
					/>

					{search.error &&
						// @lore visual-parity S-02: when /api/search returns 404 (not yet implemented),
						// show an informative "coming soon" empty state instead of a generic error.
						// This distinguishes "search not built yet" from "search broke".
						(search.error.includes("404") || search.error.includes("HTTP 404") ? (
							<EmptyState
								title="Search coming soon"
								description="Full-text search across conversations, bets, and knowledge is being built."
								icon={
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
								}
								iconBg="rgba(46,125,186,0.08)"
								dataTestId="search-coming-soon"
							/>
						) : (
							<ErrorState
								title="Search failed"
								description={search.error}
								dataTestId="search-error"
							/>
						))}

					<div className="overflow-y-auto flex flex-col gap-1">
						{search.results.conversations.length > 0 && (
							<div>
								<h3 className="text-xs font-semibold text-[var(--text-tertiary)] px-2 py-1">
									Conversations
								</h3>
								{search.results.conversations.map((c) => {
									const idx = itemIndex++;
									return (
										<div
											key={c.id}
											className={
												idx === nav.activeIndex ? "bg-[var(--surface-elevated)] rounded" : ""
											}
										>
											<ThreadRow
												avatarUrl={AVATAR_PLACEHOLDER}
												title={c.title}
												snippet={c.snippet}
												timestamp={c.timestamp}
												kind={c.kind}
												onClick={() => onNavigate("conversation", c.id)}
											/>
										</div>
									);
								})}
							</div>
						)}

						{search.results.work.length > 0 && (
							<div>
								<h3 className="text-xs font-semibold text-[var(--text-tertiary)] px-2 py-1">
									Work
								</h3>
								{search.results.work.map((w) => {
									const idx = itemIndex++;
									return (
										<div
											key={w.id}
											className={
												idx === nav.activeIndex ? "bg-[var(--surface-elevated)] rounded" : ""
											}
										>
											<BetCard
												title={w.title}
												team={w.team}
												status={w.status}
												appetite={w.appetite}
												onClick={() => onNavigate("work", w.id)}
											/>
										</div>
									);
								})}
							</div>
						)}

						{search.results.knowledge.length > 0 && (
							<div>
								<h3 className="text-xs font-semibold text-[var(--text-tertiary)] px-2 py-1">
									Knowledge
								</h3>
								{search.results.knowledge.map((k) => {
									const idx = itemIndex++;
									return (
										<div
											key={k.id}
											className={
												idx === nav.activeIndex ? "bg-[var(--surface-elevated)] rounded" : ""
											}
										>
											<KnowledgeRow
												title={k.title}
												layer={k.layer}
												kind={k.kind}
												status={k.status}
												timestamp={k.timestamp}
												onClick={() => onNavigate("knowledge", k.id)}
											/>
										</div>
									);
								})}
							</div>
						)}

						{showEmptyState && (
							<EmptyState
								title="No matches"
								description="Try a different query to find conversations, work items, or knowledge."
								dataTestId="search-empty"
							/>
						)}
					</div>

					{/*
					 * @lore J3: mono recent-queries row at bottom of the
					 * Command-K overlay. Persistence of actual recent queries
					 * is deferred (J8+ knowledge-facing work); for now we
					 * render the row structure so the keyboard flow + layout
					 * match spec. The data-testid lets tests and e2e pin the
					 * region without coupling to visual text.
					 */}
					<div
						data-testid="search-recent-queries"
						aria-label="Recent queries"
						className="font-mono text-xs text-[var(--text-tertiary)] border-t border-[var(--border-subtle)] pt-2 px-1"
					>
						<span>No recent queries</span>
					</div>
				</div>
			</FocusTrap>
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: Backdrop is a visual overlay; keyboard close is handled by Escape via useKeyboardNavigation */}
			<div className="modal-backdrop" onClick={onClose} />
		</div>
	);
}
