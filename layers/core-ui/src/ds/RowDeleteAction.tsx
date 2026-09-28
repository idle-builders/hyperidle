// @lore: destructive delete behind a Menu — no inline one-click Delete on a row

// @lore: Menu closes after onSelect so two-step confirm flips row to inline Confirm/Cancel; cannot stay inside one open menu

// @lore: Menu always anchored not inline — row-level kebab can be in overflow-hidden containers; inline menu clips at the box edge; anchoring escapes it

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
