/**
 * TipTap extension builder functions for the BodyEditor component.
 *
 * @lore T1: Two distinct builder functions rather than runtime conditionals in
 * the render path. This means mini editors never load heading/list/table code.
 * The variant gating is compile-time in the extension array, not a conditional
 * inside a hook.
 *
 * @lore T1: StarterKit's built-in CodeBlock is disabled (codeBlock: false) in
 * favour of CodeBlockLowlight which adds syntax highlighting. StarterKit's
 * HorizontalRule stays as-is — we don't need to replace it.
 *
 * @lore T1: @tiptap/suggestion is NOT included in StarterKit — it must be
 * installed separately (architecture-critique I1). It is used by the slash
 * menu extension in slash-menu.tsx.
 */

import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import type { AnyExtension } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { common, createLowlight } from "lowlight";
import { Markdown } from "tiptap-markdown";
import { buildSlashMenuExtension } from "./slash-menu.js";

// Create a shared lowlight instance with common language support
const lowlight = createLowlight(common);

/**
 * Configure the Link extension with Cmd+K keyboard shortcut.
 * openOnClick: false — prevents navigation during editing mode.
 */
function buildLinkExtension(): AnyExtension {
	return Link.configure({
		openOnClick: false,
		// biome-ignore lint/style/useNamingConvention: TipTap's own API uses PascalCase for this key.
		HTMLAttributes: {
			class: "text-[var(--accent-deep)] underline",
		},
	}).extend({
		addKeyboardShortcuts() {
			return {
				"Mod-k": () => {
					const url = window.prompt("URL");
					if (url) {
						this.editor.chain().focus().setLink({ href: url }).run();
						return true;
					}
					return false;
				},
			};
		},
	});
}

/**
 * Configure the Markdown extension for GFM serialization.
 *
 * @lore T1: html: false prevents parsing/serializing HTML blocks — this keeps
 * the storage format clean GFM. transformPastedText: true converts pasted
 * markdown into rich text automatically.
 */
function buildMarkdownExtension(): AnyExtension {
	return Markdown.configure({
		html: false,
		tightLists: true,
		bulletListMarker: "-",
		linkify: false,
		breaks: false,
		transformPastedText: true,
		transformCopiedText: true,
	});
}

/**
 * Build the full extension set for the "full" variant.
 * Includes all block types: headings, lists, code blocks, tables, images,
 * horizontal rules, blockquotes, plus the slash menu.
 */
export function buildFullExtensions(placeholder: string): AnyExtension[] {
	return [
		StarterKit.configure({
			// Replaced by CodeBlockLowlight for syntax highlighting
			codeBlock: false,
			// StarterKit v3 bundles Link — disable to avoid "Duplicate extension names" with our custom Link
			link: false,
		}),
		CodeBlockLowlight.configure({ lowlight }),
		Table.configure({ resizable: false }),
		TableRow,
		TableCell,
		TableHeader,
		Image.configure({ inline: false }),
		Placeholder.configure({ placeholder }),
		buildLinkExtension(),
		buildMarkdownExtension(),
		buildSlashMenuExtension(),
	];
}

/**
 * Build the minimal extension set for the "mini" variant.
 * Strips all block-level extensions except Paragraph (always on via StarterKit
 * with the block-level nodes disabled). Only inline formatting is supported.
 *
 * @lore T1: The mini variant is used for short structured text fields like bet
 * done conditions and hypotheses — it only needs inline formatting, not block
 * structure. Slash menu is intentionally not included.
 */
export function buildMiniExtensions(placeholder: string): AnyExtension[] {
	return [
		StarterKit.configure({
			heading: false,
			bulletList: false,
			orderedList: false,
			listItem: false,
			blockquote: false,
			codeBlock: false,
			horizontalRule: false,
			// StarterKit v3 bundles Link — disable to avoid "Duplicate extension names" with our custom Link
			link: false,
		}),
		Placeholder.configure({ placeholder }),
		buildLinkExtension(),
		buildMarkdownExtension(),
	];
}
