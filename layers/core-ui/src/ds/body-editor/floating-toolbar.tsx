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
			className={`type-control ${`w-[28px] h-[28px] flex items-center justify-center rounded-[var(--r-subtle)] cursor-pointer ${
				isActive
					? "bg-[var(--accent-primary-dim)] text-[var(--accent-deep)]"
					: "text-[var(--text-secondary)] hover:bg-[color-mix(in_oklab,var(--text-secondary)_8%,transparent)]"
			}`}`}
		>
			{children}
		</button>
	);
}

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
				className="border-width-thin flex items-center gap-[3px] bg-[var(--surface-elevated)]  border-[var(--border-subtle)] rounded-[var(--r-subtle)] shadow-[var(--shadow-elevated)] px-[3px] py-[3px]"
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
