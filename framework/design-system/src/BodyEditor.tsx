/**
 * BodyEditor — TipTap WYSIWYG editor component for the HyperIdle design system.
 *
 * A Tier 2 component that wraps TipTap to provide GFM markdown editing with:
 * - Two variants: "full" (all block types + slash menu) and "mini" (inline only)
 * - Floating formatting toolbar (BubbleMenu) on text selection
 * - Slash menu for block type insertion (full variant only)
 * - GFM markdown serialization via tiptap-markdown
 *
 * @lore T1: CSS import uses a relative path because the design-system package
 * exports CSS separately. The CSS is scoped under .body-editor to prevent
 * global style pollution.
 */

import { EditorContent } from "@tiptap/react";
import type { JSX } from "react";
import "./body-editor.css";
import { FloatingToolbar } from "./body-editor/floating-toolbar.js";
import { useBodyEditor } from "./body-editor/use-body-editor.js";
import { dsProps } from "./ds-attrs.js";

export interface BodyEditorProps {
	/** GFM markdown to load into the editor. Empty string for blank editor. */
	initialContent: string;

	/** Called on every content change with the serialized GFM markdown. */
	onChange: (markdown: string) => void;

	/** Placeholder text shown when editor is empty. Default: "Start writing..." */
	placeholder?: string;

	/** Auto-focus the editor on mount. Default: false. */
	autoFocus?: boolean;

	/** Minimum CSS height for the editor surface. Default: "120px". */
	minHeight?: string;

	/** When false, editor is read-only. Default: true. */
	editable?: boolean;

	/**
	 * "full" = slash menu + all block types + inline formatting.
	 * "mini" = inline formatting only (no slash menu, no block insertion).
	 * Default: "full".
	 */
	variant?: "full" | "mini";

	/** Additional CSS class on the outermost wrapper. */
	className?: string;
}

/**
 * TipTap WYSIWYG editor component.
 * Tier 2 design-system component.
 *
 * The parent controls the editor via props:
 * - initialContent: consumed once at mount (not re-synced)
 * - onChange: fired on every document mutation with serialized GFM
 * - editable: toggles read-only mode
 */
export function BodyEditor({
	initialContent,
	onChange,
	placeholder = "Start writing...",
	autoFocus = false,
	minHeight = "120px",
	editable = true,
	variant = "full",
	className,
}: BodyEditorProps): JSX.Element {
	const editor = useBodyEditor({
		initialContent,
		onChange,
		editable,
		variant,
		placeholder,
	});

	return (
		<div
			{...dsProps("BodyEditor", "2")}
			className={`body-editor${className ? ` ${className}` : ""}`}
			style={{ minHeight }}
		>
			{editor && (
				<>
					<EditorContent editor={editor} autoFocus={autoFocus} />
					<FloatingToolbar editor={editor} />
				</>
			)}
		</div>
	);
}
