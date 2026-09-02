/**
 * RowDeleteAction — the one destructive-delete grammar for a Row's `actions`
 * slot: kebab → Menu → row flips to inline Confirm/Cancel.
 *
 * @lore FR-10: destructive delete moved behind a Menu; no inline one-click
 * Delete button ever sits directly on a row.
 * @lore FR-10b: Menu always closes after onSelect (Menu.tsx:183), so a
 * two-step confirm cannot stay inside one open menu. The first "Delete"
 * click closes the menu and flips the row to inline Confirm/Cancel buttons
 * — cleaner than reopening the menu for the second click.
 * @lore knowledge-attachment-slot: extracted from SettingsAgents.tsx, whose
 * open-menu/confirming-id state was lifted to the parent (coordinating one
 * open menu across every row in the list). Here each instance owns its own
 * state instead — simpler, and matches how SettingsConnections' ConnectionRow
 * already manages its own per-row menu. Two rows' menus open at once is an
 * edge case nothing else in this design system prevents either.
 * @lore knowledge-attachment-slot: `onDelete` is optional so a row that has
 * other menu items (e.g. "Edit") but no delete affordance for that particular
 * row (SettingsAgents' assistant row) still gets the same kebab+Menu chrome
 * without a destructive item or confirm step, instead of forking a second
 * "just a menu" component for one row.
 *
 * @lore knowledge-attachment-slot: the Menu below is always anchored
 * (`anchorRef`) rather than inline-positioned. A row-level kebab can sit in
 * any list container, including a "boxed" ItemList (`overflow-hidden`, for
 * the rounded-corner clip) — a single-row boxed list has no room inside that
 * box for an absolutely-positioned menu to open into, so it gets clipped at
 * the box edge with the Delete item invisible. Anchoring escapes that
 * ancestor entirely; see Menu.tsx's lore for the mechanism.
 */

import { type JSX, useCallback, useRef, useState } from "react";
import { Menu, type MenuItem } from "./Menu.js";

export interface RowDeleteActionProps {
	/** aria-label for the "..." trigger button, e.g. `Actions for ${name}`. */
	triggerLabel: string;
	/** aria-label for the open Menu panel. */
	menuLabel: string;
	/** Non-destructive items shown above Delete (e.g. "Edit"). */
	items?: MenuItem[];
	/** Called on the second (confirm) click. Omit to render the menu with no Delete item. */
	onDelete?: () => void | Promise<void>;
	/** Label for the destructive menu item. Default "Delete". */
	deleteLabel?: string;
	/** ms before the inline confirm reverts with no second click. Default 3000. */
	confirmTimeoutMs?: number;
}

export function RowDeleteAction({
	triggerLabel,
	menuLabel,
	items = [],
	onDelete,
	deleteLabel = "Delete",
	confirmTimeoutMs = 3000,
}: RowDeleteActionProps): JSX.Element {
	const [menuOpen, setMenuOpen] = useState(false);
	const [confirming, setConfirming] = useState(false);
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const triggerRef = useRef<HTMLDivElement>(null);

	const clearPendingRevert = useCallback((): void => {
		if (timeoutRef.current) {
			clearTimeout(timeoutRef.current);
			timeoutRef.current = null;
		}
	}, []);

	const startConfirm = useCallback((): void => {
		clearPendingRevert();
		setConfirming(true);
		timeoutRef.current = setTimeout(() => {
			setConfirming(false);
			timeoutRef.current = null;
		}, confirmTimeoutMs);
	}, [clearPendingRevert, confirmTimeoutMs]);

	if (confirming) {
		return (
			<div className="flex items-center gap-[6px]">
				<button
					type="button"
					onClick={(e) => {
						e.preventDefault();
						e.stopPropagation();
						clearPendingRevert();
						setConfirming(false);
					}}
					className="type-control cursor-pointer px-[8px] h-[28px] rounded-[var(--r-subtle)] text-[var(--text-tertiary)] hover:bg-[color-mix(in_oklab,var(--text-secondary)_8%,transparent)] hover:text-[var(--text-primary)]"
				>
					Cancel
				</button>
				<button
					type="button"
					aria-label="Confirm delete?"
					onClick={(e) => {
						e.preventDefault();
						e.stopPropagation();
						clearPendingRevert();
						setConfirming(false);
						void onDelete?.();
					}}
					className="type-control cursor-pointer px-[8px] h-[28px] rounded-[var(--r-subtle)] text-[var(--status-error)] hover:bg-[color-mix(in_oklab,var(--status-error)_8%,transparent)]"
				>
					Confirm delete?
				</button>
			</div>
		);
	}

	const menuItems: MenuItem[] = onDelete
		? [...items, { id: "delete", label: deleteLabel, destructive: true, onSelect: startConfirm }]
		: items;

	return (
		<div ref={triggerRef} className="relative">
			<button
				type="button"
				aria-label={triggerLabel}
				aria-haspopup="menu"
				aria-expanded={menuOpen}
				onClick={(e) => {
					e.preventDefault();
					e.stopPropagation();
					setMenuOpen((open) => !open);
				}}
				className="type-control cursor-pointer inline-flex h-[28px] w-[28px] items-center justify-center rounded-[var(--r-subtle)] text-[var(--text-tertiary)] hover:bg-[color-mix(in_oklab,var(--text-secondary)_8%,transparent)] hover:text-[var(--text-primary)]"
			>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
					<circle cx="12" cy="5" r="2" />
					<circle cx="12" cy="12" r="2" />
					<circle cx="12" cy="19" r="2" />
				</svg>
			</button>
			<Menu
				open={menuOpen}
				onClose={() => setMenuOpen(false)}
				label={menuLabel}
				align="end"
				items={menuItems}
				anchorRef={triggerRef}
			/>
		</div>
	);
}
