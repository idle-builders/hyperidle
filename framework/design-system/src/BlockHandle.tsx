import type { JSX, KeyboardEvent } from "react";

export interface BlockHandleProps {
	open: boolean;
	threadCount: number;
	onOpen: () => void;
	onClose: () => void;
	/**
	 * Optional copy-permalink hook. The handle does NOT own the global ⌘L
	 * shortcut — `Block` does — but consumers may pass a click target.
	 */
	onCopyPermalink?: () => void;
	ariaControls: string;
	className?: string;
}

/**
 * Hover-revealed left-side handle. Renders a chevron-right glyph (rotates 90°
 * to chevron-down when popover is open). NO 6-dot grip — drag-reorder is
 * rejected (approved.md § "Rejected list" #3).
 *
 * @lore Cursor is `pointer`, not `grab` — the handle opens a popover; it does
 * not move the block.
 *
 * @lore Touch target is ≥ 44 CSS px under coarse pointers (mobile / tablet)
 * via `[@media(pointer:coarse)]:min-w-[44px]`; the visible icon stays 12px.
 *
 * @lore The chevron rotation is gated behind `motion-reduce:` so users with
 * `prefers-reduced-motion: reduce` don't see the transition.
 */
export function BlockHandle({
	open,
	threadCount,
	onOpen,
	onClose,
	ariaControls,
	className,
}: BlockHandleProps): JSX.Element {
	const handleClick = (): void => {
		if (open) onClose();
		else onOpen();
	};
	const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>): void => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			handleClick();
		}
	};
	return (
		<button
			type="button"
			data-ds-component="block-handle"
			data-ds-tier="2"
			data-ds-source="design-system"
			aria-expanded={open}
			aria-controls={ariaControls}
			aria-label={`Block actions${threadCount > 0 ? ` (${threadCount} threads)` : ""}`}
			onClick={handleClick}
			onKeyDown={handleKeyDown}
			className={`inline-flex items-center gap-[3px] w-[20px] h-[20px] justify-center rounded-[var(--r-subtle)] text-[var(--text-secondary)] hover:bg-[color-mix(in_oklab,var(--text-secondary)_8%,transparent)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)] [@media(pointer:coarse)]:min-w-[44px] [@media(pointer:coarse)]:min-h-[44px] ${className ?? ""}`}
			style={{ opacity: open ? 1 : undefined }}
		>
			<svg
				width="12"
				height="12"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
				aria-hidden="true"
				className="motion-reduce:!transition-none"
				style={{
					transform: open ? "rotate(90deg)" : undefined,
					transition: "transform var(--motion-fast, 120ms)",
				}}
			>
				<polyline points="9 18 15 12 9 6" />
			</svg>
			{threadCount > 0 ? (
				<span className="text-[11px] font-mono text-[var(--text-secondary)]">{threadCount}</span>
			) : null}
		</button>
	);
}
