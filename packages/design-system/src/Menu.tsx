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
 * Bet items emit data-bet-action (queried by AF12/L14 e2e); knowledge items emit data-testid.
 * A single fixed testId prop would break bet e2e that queries [data-bet-action="kill"], not
 * [data-testid]. Both handled through the same verbatim passthrough mechanism.
 */

// hearth-internal-padding

import { type JSX, useEffect, useRef } from "react";
import { dsProps } from "./ds-attrs.js";

export interface MenuItem {
	id: string;
	label: string;
	onSelect: () => void;
	disabled?: boolean;
	/** Red text (--status-error). Hearth red-only danger variant. */
	destructive?: boolean;
	/** Mono, right-aligned shortcut hint. */
	shortcut?: string;
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
}

export function Menu({
	open,
	onClose,
	items,
	label,
	align = "end",
}: MenuProps): JSX.Element | null {
	const menuRef = useRef<HTMLDivElement>(null);
	/** Element that had focus before the menu opened — restored on close. */
	const previousFocusRef = useRef<Element | null>(null);

	// On open: capture previously-focused element + move focus to first enabled item.
	// On close: restore focus to the previously-focused element.
	useEffect(() => {
		if (open) {
			previousFocusRef.current = document.activeElement;
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
	}, [open]);

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

	if (!open) return null;

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

	return (
		<div
			{...dsProps("Menu", "1")}
			ref={menuRef}
			role="menu"
			aria-label={label}
			className={`absolute ${alignClass} top-full z-50 mt-1 min-w-[160px] bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-[var(--r-default)] shadow-[var(--shadow-elevated)] p-[3px] flex flex-col gap-[3px]`}
		>
			{items.map((item, index) => (
				<button
					key={item.id}
					type="button"
					role="menuitem"
					aria-disabled={item.disabled ? "true" : undefined}
					disabled={item.disabled}
					{...(item.dataAttrs ?? {})}
					onClick={() => {
						if (item.disabled) return;
						item.onSelect();
						onClose();
					}}
					onKeyDown={(e) => handleItemKeyDown(e, item, index)}
					// hearth-internal-padding: py-[9px] is optically tuned item padding
					className={`text-left text-[13px] px-[12px] py-[9px] rounded-[var(--r-subtle)] hover:bg-[color-mix(in_oklab,var(--text-secondary)_8%,transparent)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-primary)] focus-visible:[outline-offset:-1px] disabled:opacity-50 flex items-center justify-between gap-[12px] w-full${item.destructive ? " text-[var(--status-error)]" : " text-[var(--text-primary)]"}`}
				>
					<span>{item.label}</span>
					{item.shortcut ? (
						<span className="font-mono text-[11px] text-[var(--text-tertiary)]">
							{item.shortcut}
						</span>
					) : null}
				</button>
			))}
		</div>
	);
}
