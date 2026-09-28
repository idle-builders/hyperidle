// @lore: anchorRef — position:fixed portal to #overlay-root escapes overflow-hidden; renders inline without it; dataAttrs spread verbatim for e2e selectors

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
	shortcut?: string;
	icon?: ReactNode;
	dataAttrs?: Record<string, string>;
}

export interface MenuProps {
	open: boolean;
	onClose: () => void;
	items: MenuItem[];
	label: string;
	align?: "start" | "end";
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
	const previousFocusRef = useRef<Element | null>(null);
	// Fixed-position coordinates when anchored — null until measured, which
	// also doubles as "not yet safe to paint" for the anchored branch.
	const [anchoredPos, setAnchoredPos] = useState<{
		top: number;
		left?: number;
		right?: number;
	} | null>(null);

	// @lore: anchoredPos in focus effect deps — renders null until measured; without it [open]-only fires before content exists; focus never reaches items

	// biome-ignore lint/correctness/useExhaustiveDependencies: anchoredPos deliberately re-triggers this effect — not read in the body, see the lore above.
	useEffect(() => {
		if (open) {
			if (previousFocusRef.current === null) {
				previousFocusRef.current = document.activeElement;
			}
			const first = menuRef.current?.querySelector<HTMLElement>(
				"[role='menuitem']:not([disabled])",
			);
			first?.focus();
			return undefined;
		}
		const prev = previousFocusRef.current;
		if (prev && (prev as HTMLElement).focus) {
			(prev as HTMLElement).focus();
		}
		previousFocusRef.current = null;
		return undefined;
	}, [open, anchoredPos]);

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

	// @lore: no scroll-close on anchored menus — scroll fires immediately after open via scrollIntoView; click-outside handles cleanup
	useLayoutEffect(() => {
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
	// Anchored mode: wait for measured rect before painting — avoids one frame at wrong position.
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
						// @lore: stopPropagation required — un-stopped click reaches ancestor <a href> or row onClick before preventDefault; Row.tsx uses <a> links
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
