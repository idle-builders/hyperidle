import type { BlockId, BlockPayload } from "../block/types.js";
import {
	type JSX,
	type KeyboardEvent as ReactKeyboardEvent,
	type ReactNode,
	useCallback,
} from "react";
import type { AuthoredOutlineContext } from "./block/HeadingPayload.js";
import { renderPayload } from "./block/render-payload.js";

function isEditableTarget(target: HTMLElement): boolean {
	const tag = target.tagName;
	return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

function focusSiblingBlock(current: HTMLElement, direction: 1 | -1): boolean {
	const all = Array.from(document.querySelectorAll<HTMLElement>("[data-ds-component='block']"));
	const idx = all.indexOf(current);
	if (idx < 0) return false;
	const next = all[idx + direction];
	if (!next) return false;
	next.focus();
	return true;
}

function handleBlockKey(
	e: ReactKeyboardEvent<HTMLDivElement>,
	id: BlockId,
	onOpenActions: (() => void) | undefined,
	onCopyPermalink: ((id: BlockId) => void) | undefined,
): void {
	const target = e.target as HTMLElement;
	const editable = isEditableTarget(target);
	if (e.key === "Enter" && e.currentTarget === target) {
		e.preventDefault();
		onOpenActions?.();
		return;
	}
	if (e.key === " " && !editable && e.currentTarget === target) {
		e.preventDefault();
		onOpenActions?.();
		return;
	}
	if ((e.key === "l" || e.key === "L") && (e.metaKey || e.ctrlKey)) {
		e.preventDefault();
		onCopyPermalink?.(id);
		return;
	}
	if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !editable) {
		const dir = e.key === "ArrowDown" ? 1 : -1;
		if (focusSiblingBlock(e.currentTarget, dir)) e.preventDefault();
	}
}

export interface BlockSlots {
	gutterLeading?: ReactNode;
	inlineAfterPayload?: ReactNode;
}

export interface BlockProps {
	id: BlockId;
	payload: BlockPayload;
	state?: "default" | "hovered" | "focused" | "popover-open" | "deleted" | "unknown";
	slots?: BlockSlots;
	sanitizeHtml?: (raw: string) => string;
	className?: string;
	/** Invoked when the user copies a permalink (⌘L / Ctrl+L). */
	onCopyPermalink?: (id: BlockId) => void;
	/** Invoked when the user opens the actions popover (Enter / Space). */
	onOpenActions?: () => void;
	/** Page-owned outline shift for authored content. */
	outline?: AuthoredOutlineContext;
}

/**
 * @lore L2 AC-32: data-ds-component is LOWERCASE ("block"), not PascalCase.
 * The ds-attrs.ts default-exported `dsProps` produces PascalCase names — Block
 * renders the marker manually so the kebab-case contract holds. The same
 * applies to BlockHandle and BlockActionsPopover.
 *
 * @lore Block carries the Tailwind `group` class so per-row gutter affordances
 * (the BlockHandle, scoped via `group-hover:` / `group-focus-within:`) reveal
 * on hover/focus of the block shell. Without `group`, the gutter never appears.
 */
export function Block({
	id,
	payload,
	state = "default",
	slots,
	sanitizeHtml,
	className,
	onCopyPermalink,
	onOpenActions,
	outline,
}: BlockProps): JSX.Element {
	const kind = payload.kind;
	const effectiveState = kind === "unknown" ? "unknown" : state;

	const onKeyDown = useCallback(
		(e: ReactKeyboardEvent<HTMLDivElement>): void => {
			handleBlockKey(e, id, onOpenActions, onCopyPermalink);
		},
		[id, onCopyPermalink, onOpenActions],
	);

	return (
		<article
			data-ds-component="block"
			data-ds-tier="2"
			data-ds-source="design-system"
			data-ds-kind={kind}
			data-block-id={id}
			data-state={effectiveState}
			// biome-ignore lint/a11y/noNoninteractiveTabindex: Block shells are explicitly tabbable for ↑/↓ block stepping per AC-39.
			tabIndex={0}
			onKeyDown={onKeyDown}
			className={`group relative grid grid-cols-[32px_1fr] gap-[9px] py-[6px] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)] focus-visible:[outline-offset:-1px] hover:bg-[color-mix(in_oklab,var(--text-secondary)_4%,transparent)] ${className ?? ""}`}
		>
			<div
				data-block-gutter
				className="flex justify-end items-start pt-[3px] opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:opacity-40"
			>
				{slots?.gutterLeading}
			</div>
			<div className="flex flex-col gap-[9px] min-w-0">
				{/* @lore Suppress only the heading payload; filtering the Block would sever its stable anchor, handle, and discussion slots. */}
				{renderPayload(payload, sanitizeHtml, outline)}
				{slots?.inlineAfterPayload}
			</div>
		</article>
	);
}
