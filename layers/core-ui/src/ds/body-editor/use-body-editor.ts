// @lore: initialContent consumed ONCE at mount; remount required to load new content — standard TipTap contract

// @lore: onChangeRef prevents stale closure — TipTap registers onUpdate ONCE at editor creation; StrictMode recreates callbacks but TipTap keeps the old one

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

export function useBodyEditor({
	initialContent,
	onChange,
	editable = true,
	variant = "full",
	placeholder = "Start writing...",
}: UseBodyEditorOptions): Editor | null {
	// @lore: onChangeRef holds latest onChange — TipTap onUpdate closure captured once; StrictMode recreates callbacks but TipTap keeps old reference
	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;

	const extensions =
		variant === "full" ? buildFullExtensions(placeholder) : buildMiniExtensions(placeholder);

	const editor = useEditor({
		extensions,
		// @lore: tiptap-markdown intercepts content string as markdown when Markdown extension is present; pass initialContent directly
		content: initialContent,
		editable,
		onUpdate: ({ editor: e }) => {
			const md =
				(e.storage as { markdown?: { getMarkdown: () => string } }).markdown?.getMarkdown() ?? "";
			onChangeRef.current(md);
		},
	});

	return editor ?? null;
}
