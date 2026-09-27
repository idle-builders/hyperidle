import FocusTrap from "focus-trap-react";
import { type JSX, useCallback, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import {
	DocRow,
	EmptyState,
	ErrorState,
	ensureOverlayRoot,
	SearchField,
	TaskCard,
	ThreadRow,
	useDialogBehavior,
} from "../ds";
import { useGlobalSearch } from "../hooks/useGlobalSearch";
import { useKeyboardNavigation } from "../hooks/useKeyboardNavigation";
import { relativeShort } from "../utils/time.js";

type ResultType = "conversation" | "work" | "document";

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
 * (SearchField, ThreadRow, TaskCard, DocRow) and DaisyUI primitives. It is NOT
 * one of the 19 custom components in the component budget — it is a page-level
 * composition, similar to how a page assembles components without being a component itself.
 */

/**
 * @lore DaisyUI modal pattern uses CSS classes (modal modal-open) instead of
 * the <dialog> element so we have full control over focus and keyboard events
 * without fighting the native dialog behavior.
 */

// Z8-149: replaced #374151 (cool gray-700, AQ-008/AQ-018 violation) with
// #5c4f3d (warm earth mid-tone matching --surface-container token family).
const AVATAR_PLACEHOLDER =
	"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Crect width='32' height='32' fill='%235c4f3d'/%3E%3C/svg%3E";

export function GlobalSearchPanel({
	open,
	onClose,
	onNavigate,
}: GlobalSearchPanelProps): JSX.Element | null {
	const search = useGlobalSearch();
	const prevOpenRef = useRef(open);
	// @lore AI2: useDialogBehavior with layer="dialog" replaces DaisyUI .modal.modal-open chrome.
	// The overlay div carries data-dialog-layer="dialog" (--z-dialog = 60, above --z-overlay = 40).
	// modal=true: scrim + backdrop dismiss. isDirty=false: command palette, always clean.
	const behavior = useDialogBehavior({
		open,
		onClose,
		isDirty: false,
		modal: true,
		layer: "dialog",
	});

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
		for (const k of search.results.documents) {
			items.push({ type: "document", id: k.id });
		}
		return items;
	}, [search.results.conversations, search.results.work, search.results.documents]);

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

	const overlayProps = behavior.getOverlayProps();

	// @lore AI2: nav.onKeyDown handles Escape (→ onClose) and ArrowUp/Down/Enter navigation.
	// We do NOT also call overlayProps.onKeyDown here because isDirty=false always for the
	// command palette, so both handlers would call onClose on Escape (double-fire).
	// behavior.requestDismiss is used only for the Close button (confirmations not relevant here).
	const handleKeyDown = (e: React.KeyboardEvent): void => {
		nav.onKeyDown(e.nativeEvent);
	};

	const hasQuery = search.query.length > 0;
	const showEmptyState = hasQuery && !search.loading && !search.hasResults && !search.error;

	let itemIndex = 0;

	/*
	 * @lore AI2: DaisyUI .modal.modal-open replaced by useDialogBehavior overlay.
	 * The panel div carries data-dialog-layer="dialog" (--z-dialog = 60, above --z-overlay = 40).
	 * max-w-[640px] SURVIVES on this same element — the sanctioned test asserts both attributes
	 * on the same node. The scrim (backdrop) is rendered as a separate fixed sibling div.
	 * See architecture.md §Sanctioned assertion changes #2.
	 *
	 * @lore UI-001: createPortal into #overlay-root (sibling of #root) prevents the
	 * panel from being caught by the inert attribute that useDialogBehavior sets on
	 * #root while a modal is open. Without the portal the input is inside the inerted
	 * subtree and typing/Escape both become no-ops. Mirrors the Dialog.tsx pattern.
	 */
	return createPortal(
		<>
			{/* Scrim / backdrop — closes on click */}
			<div
				aria-hidden="true"
				style={{
					position: "fixed",
					inset: 0,
					zIndex: "var(--z-scrim)",
					background: "var(--scrim)",
				}}
				onMouseDown={onClose}
			/>
			{/*
			 * @lore focus-trap-react requires tabbableOptions.displayCheck="none" in jsdom
			 * because jsdom doesn't implement CSS visibility/display checks. The fallbackFocus
			 * ensures activation succeeds even when jsdom cannot detect tabbable nodes.
			 */}
			<FocusTrap
				focusTrapOptions={{
					initialFocus: false,
					allowOutsideClick: true,
					fallbackFocus: "[data-dialog-layer]",
					tabbableOptions: { displayCheck: "none" },
				}}
			>
				{/* Panel — data-dialog-layer + max-w-[640px] on the same node (sanctioned assertion) */}
				{/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: role is statically typed "dialog" in useDialogBehavior.getOverlayProps — biome can't see through the indirection to know aria-modal is valid here. */}
				{/* biome-ignore lint/a11y/noStaticElementInteractions: same indirection — role is "dialog", which supports onKeyDown for the Escape-to-close handler. */}
				<div
					role={overlayProps.role}
					aria-modal={overlayProps["aria-modal"]}
					data-dialog-layer={overlayProps["data-dialog-layer"]}
					aria-label="Global search"
					onKeyDown={handleKeyDown}
					style={{
						position: "fixed",
						top: "10vh",
						left: "50%",
						transform: "translateX(-50%)",
						zIndex: overlayProps.style.zIndex,
					}}
					className="max-w-[640px] w-full p-3 flex flex-col gap-[9px] max-h-[80vh] bg-[var(--surface-elevated)] rounded-[var(--r-default)] shadow-[var(--shadow-elevated)]"
				>
					<SearchField
						placeholder="Search conversations, work, documents..."
						value={search.query}
						onChange={search.setQuery}
						loading={search.loading}
						shortcutKey="⌘K"
						ref={focusRef}
					/>

					{/* Z8-152: removed 404-as-"coming-soon" branch. /api/search is always
					    mounted; a 404 now indicates a real route regression and should surface
					    as a generic search error, not a "coming soon" affordance that masks it. */}
					{search.error && (
						<ErrorState
							title="Search failed"
							description={search.error}
							dataTestId="search-error"
						/>
					)}

					<div className="overflow-y-auto flex flex-col gap-[3px]">
						{search.results.conversations.length > 0 && (
							<div>
								<h3 className="type-label   text-[var(--text-tertiary)] px-2 py-1">
									Conversations
								</h3>
								{search.results.conversations.map((c) => {
									const idx = itemIndex++;
									return (
										<div
											key={c.id}
											className={
												idx === nav.activeIndex
													? "bg-[var(--surface-elevated)] rounded-[var(--r-subtle)]"
													: ""
											}
										>
											<ThreadRow
												avatarUrl={AVATAR_PLACEHOLDER}
												title={c.title}
												snippet={c.snippet}
												timestamp={relativeShort(c.timestamp)}
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
								<h3 className="type-label   text-[var(--text-tertiary)] px-2 py-1">Work</h3>
								{search.results.work.map((w) => {
									const idx = itemIndex++;
									return (
										<div
											key={w.id}
											className={
												idx === nav.activeIndex
													? "bg-[var(--surface-elevated)] rounded-[var(--r-subtle)]"
													: ""
											}
										>
											{/* @lore BB1: BetCard replaced by TaskCard — tasks are the one work primitive. */}
											<TaskCard
												title={w.title}
												team={w.team}
												state={w.state}
												onClick={() => onNavigate("work", w.id)}
											/>
										</div>
									);
								})}
							</div>
						)}

						{search.results.documents.length > 0 && (
							<div>
								<h3 className="type-label   text-[var(--text-tertiary)] px-2 py-1">Documents</h3>
								{search.results.documents.map((k) => {
									const idx = itemIndex++;
									return (
										<div
											key={k.id}
											className={
												idx === nav.activeIndex
													? "bg-[var(--surface-elevated)] rounded-[var(--r-subtle)]"
													: ""
											}
										>
											<DocRow
												title={k.title}
												status={k.status}
												timestamp={relativeShort(k.timestamp)}
												onClick={() => onNavigate("document", k.id)}
											/>
										</div>
									);
								})}
							</div>
						)}

						{showEmptyState && (
							<EmptyState
								title="No matches"
								description="Try a different query to find conversations, work items, or documents."
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
					 * @lore UI: hide when results are on screen — "No recent queries"
					 * shown alongside matches is contradictory. Only visible when
					 * the result list is empty (no query or no matches).
					 */}
					{!search.hasResults && (
						// biome-ignore lint/a11y/useSemanticElements: not a form — <fieldset> doesn't apply to this region; role="group" is what makes the aria-label below take effect.
						<div
							role="group"
							data-testid="search-recent-queries"
							aria-label="Recent queries"
							className="type-data border-width-thin-t   text-[var(--text-tertiary)]  border-[var(--border-subtle)] pt-2 px-1"
						>
							<span>No recent queries</span>
						</div>
					)}
				</div>
			</FocusTrap>
		</>,
		ensureOverlayRoot(),
	);
}
