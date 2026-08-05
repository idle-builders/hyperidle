/**
 * Floating toolbar — BubbleMenu wrapper with inline formatting buttons.
 * Renders when text is selected in the editor.
 *
 * @lore T1: Text labels (B, I, <>, S, Link) instead of icons to avoid icon
 * dependency and maintain density-first aesthetic at 13px.
 *
 * @lore T1: BubbleMenu hardcoded px values (4px gap, 28px buttons) are
 * 4px-grid compliant (AQ-001). The toolbar is a small overlay surface —
 * the fixed sizes are intentional for a crisp floating element. Architecture-
 * critique I5 noted this as acceptable for a small surface.
 *
 * @lore T1: All buttons include aria-label for accessibility (per architecture
 * critique I6). Active state uses aria-pressed to signal toggle state.
 */

import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import type { JSX } from "react";

interface FloatingToolbarProps {
	editor: Editor;
}

interface ToolbarButtonProps {
	onClick: () => void;
	isActive: boolean;
	ariaLabel: string;
	children: React.ReactNode;
}

function ToolbarButton({
	onClick,
	isActive,
	ariaLabel,
	children,
}: ToolbarButtonProps): JSX.Element {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-label={ariaLabel}
			aria-pressed={isActive}
			className={`w-[28px] h-[28px] flex items-center justify-center rounded-[var(--r-subtle)] text-[13px] font-medium cursor-pointer transition-colors ${
				isActive
					? "bg-[var(--accent-primary-dim)] text-[var(--accent-primary)]"
					: "text-[var(--text-secondary)] hover:bg-[color-mix(in_oklab,var(--text-secondary)_8%,transparent)]"
			}`}
		>
			{children}
		</button>
	);
}

/**
 * Handle the link button click.
 * - If a link is active: remove it.
 * - If text is selected and no link: prompt for URL and set it.
 */
function handleLinkClick(editor: Editor): void {
	if (editor.isActive("link")) {
		editor.chain().focus().unsetLink().run();
	} else {
		const url = window.prompt("URL");
		if (url) {
			editor.chain().focus().setLink({ href: url }).run();
		}
	}
}

/**
 * Floating formatting toolbar rendered on text selection.
 * Uses TipTap's BubbleMenu which handles positioning automatically.
 */
export function FloatingToolbar({ editor }: FloatingToolbarProps): JSX.Element {
	return (
		<BubbleMenu
			editor={editor}
			options={{
				placement: "top",
			}}
		>
			<div
				role="toolbar"
				aria-label="Text formatting"
				className="flex items-center gap-[3px] bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-[var(--r-subtle)] shadow-[var(--shadow-elevated)] px-[3px] py-[3px]"
			>
				<ToolbarButton
					onClick={() => editor.chain().focus().toggleBold().run()}
					isActive={editor.isActive("bold")}
					ariaLabel="Bold"
				>
					<strong>B</strong>
				</ToolbarButton>
				<ToolbarButton
					onClick={() => editor.chain().focus().toggleItalic().run()}
					isActive={editor.isActive("italic")}
					ariaLabel="Italic"
				>
					<em>I</em>
				</ToolbarButton>
				<ToolbarButton
					onClick={() => editor.chain().focus().toggleCode().run()}
					isActive={editor.isActive("code")}
					ariaLabel="Inline code"
				>
					{"<>"}
				</ToolbarButton>
				<ToolbarButton
					onClick={() => editor.chain().focus().toggleStrike().run()}
					isActive={editor.isActive("strike")}
					ariaLabel="Strikethrough"
				>
					<s>S</s>
				</ToolbarButton>
				<ToolbarButton
					onClick={() => handleLinkClick(editor)}
					isActive={editor.isActive("link")}
					ariaLabel="Link"
				>
					Link
				</ToolbarButton>
			</div>
		</BubbleMenu>
	);
}
