import { type JSX, useEffect, useRef, useState } from "react";
import { Menu, type MenuItem } from "./Menu.js";

export interface BlockAction {
	id: string;
	label: string;
	shortcut?: string;
	hint?: string;
	disabled?: boolean;
	onSelect: () => void;
}

export interface BlockActionsPopoverProps {
	/** Required popover id; the matching `aria-controls` lives on the BlockHandle. */
	id: string;
	open: boolean;
	onClose: () => void;
	items: BlockAction[];
	liveRegionId: string;
}

const COPY_FEEDBACK_MS = 1500;

/**
 * Right-start popover anchored to the BlockHandle. Built without
 * @floating-ui/react in the unit-test path (jsdom can't measure positions);
 * positioning is host-side via absolute/fixed CSS in the live UI. Test
 * surface: role=menu, items role=menuitem, Escape closes, click invokes.
 *
 * @lore L2 AC-31: aria-disabled on disabled items; aria-live polite region
 * for the copy-success announcement (AC-42).
 *
 * @lore The "copy" item rotates its label to "Copied" for 1500ms after
 * invocation; the popover then closes automatically.
 *
 * @lore AG5 C1: Refactored to render through <Menu> — BlockActionsPopover is now a thin
 * wrapper. Menu owns: role=menu container, item chrome, Escape, click-outside, keyboard nav.
 * BlockActionsPopover owns: copy-feedback label flip, aria-live region, id/aria-controls wiring.
 * This eliminates the duplicate menu anatomy that AG5 was created to kill.
 */
export function BlockActionsPopover({
	id,
	open,
	onClose,
	items,
	liveRegionId,
}: BlockActionsPopoverProps): JSX.Element | null {
	const [announce, setAnnounce] = useState("");
	const [copiedAt, setCopiedAt] = useState<number | null>(null);
	const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		return () => {
			if (closeTimer.current) clearTimeout(closeTimer.current);
		};
	}, []);

	if (!open) return null;

	const isCopied = copiedAt !== null && Date.now() - copiedAt < COPY_FEEDBACK_MS;

	const menuItems: MenuItem[] = items.map((item) => {
		const isCopyItem = item.id === "copy";
		const label = isCopyItem && isCopied ? "Copied" : item.label;

		return {
			id: item.id,
			label,
			shortcut: item.shortcut,
			disabled: item.disabled,
			onSelect: () => {
				if (item.disabled) return;
				item.onSelect();
				if (isCopyItem) {
					setAnnounce("Copied");
					setCopiedAt(Date.now());
					if (closeTimer.current) clearTimeout(closeTimer.current);
					closeTimer.current = setTimeout(() => {
						setCopiedAt(null);
						onClose();
					}, COPY_FEEDBACK_MS);
				}
			},
		};
	});

	return (
		<div
			id={id}
			data-ds-component="block-actions-popover"
			data-testid="block-actions-popover"
			data-ds-tier="2"
			data-ds-source="design-system"
		>
			<Menu open={open} onClose={onClose} items={menuItems} label="Block actions" align="end" />
			<span id={liveRegionId} aria-live="polite" className="sr-only">
				{announce}
			</span>
		</div>
	);
}
