// @lore: two builder fns (full/mini) — mini never loads heading/list/table code; variant split is in extension array, not hook conditionals

// @lore: codeBlock:false in StarterKit — CodeBlockLowlight provides syntax highlighting; StarterKit built-in codeBlock is inactive

// @lore: @tiptap/suggestion not in StarterKit — must be installed separately; used by slash-menu.tsx

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

const lowlight = createLowlight(common);

function buildLinkExtension(): AnyExtension {
	return Link.configure({
		openOnClick: false,
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

// @lore: html:false in Markdown extension — keeps storage as clean GFM; transformPastedText converts pasted markdown to rich text
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

export function buildFullExtensions(placeholder: string): AnyExtension[] {
	return [
		StarterKit.configure({
			codeBlock: false,
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

// @lore: mini variant — inline formatting only (no heading/list/table/slash-menu); for short structured text fields
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
			link: false,
		}),
		Placeholder.configure({ placeholder }),
		buildLinkExtension(),
		buildMarkdownExtension(),
	];
}
