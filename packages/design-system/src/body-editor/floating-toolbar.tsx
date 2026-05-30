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
import { BubbleMenu } from "@tiptap/react";
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
			className={`w-[28px] h-[28px] flex items-center justify-center rounded-[var(--r1)] text-[13px] font-medium cursor-pointer transition-colors ${
				isActive
					? "bg-[var(--primary-dim)] text-[var(--primary)]"
					: "text-[var(--text-mid)] hover:bg-[var(--surface-ghost)]"
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
			tippyOptions={{
				placement: "top",
				animation: false,
			}}
		>
			<div
				role="toolbar"
				aria-label="Text formatting"
				className="flex items-center gap-[4px] bg-[var(--surface-2)] border border-[var(--border-default)] rounded-[var(--r1)] shadow-[var(--float)] px-[4px] py-[2px]"
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
