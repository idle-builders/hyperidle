/**
 * useBodyEditor — wraps TipTap's useEditor with markdown serialization.
 *
 * @lore T1: initialContent is consumed ONCE at mount time via the `content`
 * option. The editor is not re-initialized if initialContent changes — the
 * parent must remount the component to load new content. This is the standard
 * TipTap contract.
 *
 * @lore T1: onChange fires via onUpdate which is called on every ProseMirror
 * transaction that changes the document. The parent owns debouncing and
 * persistence — this hook does not debounce.
 *
 * @lore T1: editor.storage.markdown.getMarkdown() is provided by the
 * tiptap-markdown extension and serializes the current document to GFM.
 *
 * @lore R9: TipTap registers the onUpdate listener ONCE at editor creation
 * (inside useEditor with deps=[]). If the parent's onChange identity changes
 * (due to React 18 StrictMode double-invocation recreating callbacks), the
 * TipTap editor still calls the OLD closure. Using onChangeRef ensures the
 * onUpdate handler always calls the CURRENT onChange without recreating the
 * editor. The ref is synced on every render before useEditor runs.
 */

import { type Editor, useEditor } from "@tiptap/react";
import { useRef } from "react";
import { buildFullExtensions, buildMiniExtensions } from "./extensions.js";

export interface UseBodyEditorOptions {
	initialContent: string;
	onChange: (markdown: string) => void;
	editable?: boolean;
	variant?: "full" | "mini";
	placeholder?: string;
}

/**
 * Returns a configured TipTap Editor instance with:
 * - markdown content loaded from initialContent
 * - onChange serialization via tiptap-markdown
 * - editable / read-only mode
 * - variant-appropriate extension set (full or mini)
 */
export function useBodyEditor({
	initialContent,
	onChange,
	editable = true,
	variant = "full",
	placeholder = "Start writing...",
}: UseBodyEditorOptions): Editor | null {
	// @lore R9: Keep a ref to the latest onChange so TipTap's onUpdate closure
	// (captured once at editor creation) always calls the current handler.
	// This avoids the stale-closure issue where React 18 StrictMode recreates
	// parent callbacks but TipTap's registered listener keeps the old reference.
	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;

	const extensions =
		variant === "full" ? buildFullExtensions(placeholder) : buildMiniExtensions(placeholder);

	const editor = useEditor({
		extensions,
		// @lore T1: TipTap with tiptap-markdown parses the content string as
		// markdown when the Markdown extension is in the extensions array.
		// Pass initialContent directly — tiptap-markdown intercepts it.
		content: initialContent,
		editable,
		onUpdate: ({ editor: e }) => {
			// Serialize to GFM markdown and call onChange via ref
			// editor.storage.markdown is provided by the tiptap-markdown extension
			const md =
				(e.storage as { markdown?: { getMarkdown: () => string } }).markdown?.getMarkdown() ?? "";
			onChangeRef.current(md);
		},
	});

	return editor ?? null;
}
