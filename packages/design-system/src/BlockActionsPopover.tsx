import { type JSX, useEffect, useRef, useState } from "react";

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
		if (!open) return;
		const onKey = (e: KeyboardEvent): void => {
			if (e.key === "Escape") {
				e.stopPropagation();
				onClose();
			}
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [open, onClose]);

	useEffect(() => {
		return () => {
			if (closeTimer.current) clearTimeout(closeTimer.current);
		};
	}, []);

	if (!open) return null;

	const isCopied = copiedAt !== null && Date.now() - copiedAt < COPY_FEEDBACK_MS;

	return (
		<div
			id={id}
			data-ds-component="block-actions-popover"
			data-testid="block-actions-popover"
			data-ds-tier="2"
			data-ds-source="design-system"
			role="menu"
			className="absolute z-50 min-w-[200px] bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-[var(--r2)] shadow-lg p-[4px] flex flex-col gap-[4px]"
		>
			{items.map((item) => {
				const isCopyItem = item.id === "copy";
				const label = isCopyItem && isCopied ? "Copied" : item.label;
				return (
					<button
						key={item.id}
						type="button"
						role="menuitem"
						aria-disabled={item.disabled || undefined}
						disabled={item.disabled}
						onClick={() => {
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
						}}
						className="text-left text-[length:var(--text-sm,13px)] text-[var(--text)] px-[12px] py-[8px] rounded-[var(--r1)] hover:bg-[var(--surface-ghost)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)] focus-visible:[outline-offset:-1px] disabled:opacity-50 flex items-center justify-between gap-[12px]"
						style={isCopyItem && isCopied ? { color: "var(--ok)" } : undefined}
					>
						<span>{label}</span>
						{item.shortcut ? (
							<span className="font-mono text-[11px] text-[var(--text-lo)]">{item.shortcut}</span>
						) : null}
					</button>
				);
			})}
			<span id={liveRegionId} aria-live="polite" className="sr-only">
				{announce}
			</span>
		</div>
	);
}
