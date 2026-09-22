/**
 * Menu — generalized anchored action menu (Tier 1 primitive).
 *
 * Single owner of the menu anatomy: container, open/close, Escape/click-outside,
 * item-style, keyboard navigation (ArrowUp/Down/Home/End/Enter/Space/Tab/Escape),
 * role=menu/menuitem, aria-disabled, dataAttrs passthrough.
 *
 * The trigger is caller-owned — this component renders only the open panel.
 * Caller passes open/onClose; keeps its own button + data-testid untouched.
 *
 * @lore AG5 C1: This is the single owner of menu anatomy. BlockActionsPopover and all
 * overflow menus render through this — zero duplication of role=menu container / item chrome /
 * Escape effect. Any new action menu must use Menu, not re-implement these behaviors.
 *
 * @lore AG5 C4: Per-item data attribute passthrough via dataAttrs?: Record<string,string>.
 * Bet items emit data-bet-action (queried by AF12/L14 e2e); document items emit data-testid.
 * A single fixed testId prop would break bet e2e that queries [data-bet-action="kill"], not
 * [data-testid]. Both handled through the same verbatim passthrough mechanism.
 *
 * @lore knowledge-attachment-slot: `anchorRef` is opt-in. Without it, Menu renders inline as
 * before (absolute, positioned by its DOM parent) — BlockActionsPopover and every existing
 * caller/test is unaffected. With it, Menu portals into #overlay-root (the same body-level
 * sibling Dialog/GlobalSearchPanel already use — see useDialogBehavior.ts) and positions itself
 * with `position: fixed` computed from the anchor's own bounding rect. This is what lets a
 * per-row kebab menu (RowDeleteAction) escape an `overflow-hidden` list container — a boxed
 * ItemList clips absolute children to its rounded-corner box, so a one-row list (the common
 * fresh-install case) clips the menu against the box edge with no room to open into. Fixed
 * positioning relative to the viewport, outside that ancestor, has no such ceiling.
 */

// hearth-internal-padding

import {
	type JSX,
	type ReactNode,
	type RefObject,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import { dsProps } from "./ds-attrs.js";
import { ensureOverlayRoot } from "./useDialogBehavior.js";

export interface MenuItem {
	id: string;
	label: string;
	onSelect: () => void;
	disabled?: boolean;
	/** Red text (--status-error). Hearth red-only danger variant. */
	destructive?: boolean;
	/** Mono, right-aligned shortcut hint. */
	shortcut?: string;
	/** Optional 16×16 icon node rendered left of the label. */
	icon?: ReactNode;
	/** Arbitrary data-* spread verbatim onto the item button (C4 selector preservation). */
	dataAttrs?: Record<string, string>;
}

export interface MenuProps {
	open: boolean;
	onClose: () => void;
	items: MenuItem[];
	/** aria-label on role=menu container. */
	label: string;
	/** "end" = right-0 (default). "start" = left-0. */
	align?: "start" | "end";
	/**
	 * Trigger element to anchor against. When set, Menu portals into
	 * #overlay-root and positions itself with `position: fixed` from this
	 * element's bounding rect instead of relying on a positioned DOM parent —
	 * see the knowledge-attachment-slot lore above.
	 */
	anchorRef?: RefObject<HTMLElement | null>;
}

/** Gap (px) between the anchor and the menu — matches the inline mode's `mt-1`. */
const ANCHOR_GAP = 4;

export function Menu({
	open,
	onClose,
	items,
	label,
	align = "end",
	anchorRef,
}: MenuProps): JSX.Element | null {
	const menuRef = useRef<HTMLDivElement>(null);
	/** Element that had focus before the menu opened — restored on close. */
	const previousFocusRef = useRef<Element | null>(null);
	// Fixed-position coordinates when anchored — null until measured, which
	// also doubles as "not yet safe to paint" for the anchored branch.
	const [anchoredPos, setAnchoredPos] = useState<{
		top: number;
		left?: number;
		right?: number;
	} | null>(null);

	// On open: capture previously-focused element + move focus to first enabled item.
	// On close: restore focus to the previously-focused element.
	//
	// @lore knowledge-attachment-slot: `anchoredPos` is in the dependency array
	// alongside `open`. Anchored mode renders null on the first commit after
	// open flips true (no measured position yet — see the layout effect above)
	// and only mounts the real menu items once `anchoredPos` is set on the
	// next commit. This effect's `[open]`-only version fired once, against
	// that first (itemless) commit, and never got a second chance — focus
	// silently stayed on the trigger. Re-running on `anchoredPos` too gives it
	// that second chance; `previousFocusRef` is guarded so the extra run
	// doesn't re-capture "current focus" (which would by then already be
	// nothing, inside the closed menu).
	// biome-ignore lint/correctness/useExhaustiveDependencies: anchoredPos deliberately re-triggers this effect — not read in the body, see the lore above.
	useEffect(() => {
		if (open) {
			if (previousFocusRef.current === null) {
				previousFocusRef.current = document.activeElement;
			}
			// React commits DOM before effects run, so items are already in the DOM here.
			// No RAF needed — querying immediately is safe and avoids flaky focus races
			// in test environments where RAF fires outside act() boundaries.
			const first = menuRef.current?.querySelector<HTMLElement>(
				"[role='menuitem']:not([disabled])",
			);
			first?.focus();
			return undefined;
		}
		// Closed: restore focus to trigger.
		const prev = previousFocusRef.current;
		if (prev && (prev as HTMLElement).focus) {
			(prev as HTMLElement).focus();
		}
		previousFocusRef.current = null;
		return undefined;
	}, [open, anchoredPos]);

	// Escape closes + stopPropagation (prevents outer handlers firing on Escape)
	useEffect(() => {
		if (!open) return;
		const handleKey = (e: KeyboardEvent): void => {
			if (e.key === "Escape") {
				e.stopPropagation();
				onClose();
			}
		};
		document.addEventListener("keydown", handleKey);
		return () => document.removeEventListener("keydown", handleKey);
	}, [open, onClose]);

	// Click-outside closes (mousedown so it fires before blur)
	useEffect(() => {
		if (!open) return;
		const handleMouseDown = (e: MouseEvent): void => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				onClose();
			}
		};
		document.addEventListener("mousedown", handleMouseDown);
		return () => document.removeEventListener("mousedown", handleMouseDown);
	}, [open, onClose]);

	// Anchored mode: measure the trigger's rect synchronously (before paint) so
	// the portaled menu never flashes at (0,0). Recomputed on resize while open.
	//
	// @lore knowledge-attachment-slot: an earlier version also closed the menu
	// on any `scroll` event, on the theory that a stale position beats a
	// tracked one. In a real browser this fired immediately after opening —
	// clicking the trigger's own `scrollIntoViewIfNeeded` (or any residual
	// scroll settling on a long stacked Settings page) closed the menu before
	// the click event that opened it had even finished, so the menu never
	// stayed open long enough to be used. Removed rather than threshold-tuned:
	// nothing here needs the menu to track scroll, and click-outside already
	// closes it once the user moves on.
	useLayoutEffect(() => {
		// Non-anchored callers never touch anchoredPos (it stays its initial
		// null) — skip the effect body entirely rather than a same-value
		// setAnchoredPos(null) on every open/close, which is a harmless no-op
		// React-wise but still dispatches a state update on every render.
		if (!anchorRef) return undefined;
		if (!open) {
			setAnchoredPos(null);
			return undefined;
		}
		const measure = (): void => {
			const rect = anchorRef.current?.getBoundingClientRect();
			if (!rect) return;
			setAnchoredPos(
				align === "start"
					? { top: rect.bottom + ANCHOR_GAP, left: rect.left }
					: { top: rect.bottom + ANCHOR_GAP, right: window.innerWidth - rect.right },
			);
		};
		measure();
		window.addEventListener("resize", measure);
		return () => {
			window.removeEventListener("resize", measure);
		};
	}, [open, anchorRef, align]);

	if (!open) return null;
	// Anchored mode paints only once the rect is measured — one frame of
	// nothing beats one frame at the wrong position.
	if (anchorRef && !anchoredPos) return null;

	const alignClass = align === "start" ? "left-0" : "right-0";

	const handleItemKeyDown = (
		e: React.KeyboardEvent<HTMLButtonElement>,
		item: MenuItem,
		index: number,
	): void => {
		const allItems = menuRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']");
		if (!allItems) return;

		switch (e.key) {
			case "ArrowDown": {
				e.preventDefault();
				const next = allItems[Math.min(index + 1, allItems.length - 1)];
				next?.focus();
				break;
			}
			case "ArrowUp": {
				e.preventDefault();
				const prev = allItems[Math.max(index - 1, 0)];
				prev?.focus();
				break;
			}
			case "Home": {
				e.preventDefault();
				allItems[0]?.focus();
				break;
			}
			case "End": {
				e.preventDefault();
				allItems[allItems.length - 1]?.focus();
				break;
			}
			case "Enter":
			case " ": {
				e.preventDefault();
				if (!item.disabled) {
					item.onSelect();
					onClose();
				}
				break;
			}
			case "Tab": {
				onClose();
				break;
			}
			default:
				break;
		}
	};

	const positionClass = anchorRef
		? "fixed z-[var(--z-overlay)]"
		: `absolute ${alignClass} top-full z-50 mt-1`;
	const positionStyle: React.CSSProperties | undefined =
		anchorRef && anchoredPos
			? {
					top: anchoredPos.top,
					left: anchoredPos.left,
					right: anchoredPos.right,
				}
			: undefined;

	const menu = (
		<div
			{...dsProps("Menu", "1")}
			data-spacing-role="overlay-offset"
			ref={menuRef}
			role="menu"
			aria-label={label}
			style={positionStyle}
			className={`${positionClass} min-w-[160px] bg-[var(--surface-elevated)]  border-[var(--border-subtle)] rounded-[var(--r-default)] shadow-[var(--shadow-elevated)] p-[3px] flex flex-col gap-[3px]`}
		>
			{items.map((item, index) => (
				<button
					key={item.id}
					type="button"
					role="menuitem"
					aria-disabled={item.disabled ? "true" : undefined}
					disabled={item.disabled}
					{...(item.dataAttrs ?? {})}
					onClick={(e) => {
						// @lore knowledge-attachment-slot: without this, a menu item click
						// bubbles past Menu's own container to whatever wraps the trigger.
						// RowDeleteAction's own buttons (kebab, confirm, cancel) already
						// stop propagation on their own clicks — this was the one button
						// in the chain that didn't, and it's the one a real <a href> row
						// (or an onClick-driven div[role=button] row) needs stopped: an
						// un-stopped click reaches an ancestor <a> and navigates before
						// preventDefault is ever called, or reaches an ancestor row's
						// onClick and fires it. See Row.tsx's href contract note.
						e.preventDefault();
						e.stopPropagation();
						if (item.disabled) return;
						item.onSelect();
						onClose();
					}}
					onKeyDown={(e) => handleItemKeyDown(e, item, index)}
					// hearth-internal-padding: py-[9px] is optically tuned item padding
					className={`type-control ${`text-left  px-[12px] py-[9px] rounded-[var(--r-subtle)] hover:bg-[color-mix(in_oklab,var(--text-secondary)_8%,transparent)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)] focus-visible:[outline-offset:-1px] disabled:opacity-50 flex items-center justify-between gap-[12px] w-full${item.destructive ? " text-[var(--status-error)]" : " text-[var(--text-primary)]"}`}`}
				>
					<span className="flex items-center gap-[6px] min-w-0">
						{item.icon ? (
							<span
								className="shrink-0 w-[16px] h-[16px] flex items-center justify-center"
								aria-hidden="true"
							>
								{item.icon}
							</span>
						) : null}
						<span className="truncate">{item.label}</span>
					</span>
					{item.shortcut ? (
						<span className="type-data   text-[var(--text-tertiary)] shrink-0">
							{item.shortcut}
						</span>
					) : null}
				</button>
			))}
		</div>
	);

	return anchorRef ? createPortal(menu, ensureOverlayRoot()) : menu;
}
