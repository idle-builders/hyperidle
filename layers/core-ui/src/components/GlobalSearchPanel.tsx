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

const AVATAR_PLACEHOLDER =
	"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Crect width='32' height='32' fill='%235c4f3d'/%3E%3C/svg%3E";

export function GlobalSearchPanel({
	open,
	onClose,
	onNavigate,
}: GlobalSearchPanelProps): JSX.Element | null {
	const search = useGlobalSearch();
	const prevOpenRef = useRef(open);
	// modal=true: scrim + backdrop dismiss. isDirty=false: command palette always clean.
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

	const focusRef = useCallback((node: HTMLInputElement | null): void => {
		node?.focus();
	}, []);

	if (!open) {
		return null;
	}

	const overlayProps = behavior.getOverlayProps();

	// nav.onKeyDown handles Escape/ArrowUp/Down/Enter; overlayProps.onKeyDown not called (double-fire on Escape).
	const handleKeyDown = (e: React.KeyboardEvent): void => {
		nav.onKeyDown(e.nativeEvent);
	};

	const hasQuery = search.query.length > 0;
	const showEmptyState = hasQuery && !search.loading && !search.hasResults && !search.error;

	let itemIndex = 0;

	// @lore: portal into #overlay-root — prevents panel from being caught by inert on #root; typing/Escape would be no-ops inside the inerted subtree
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
