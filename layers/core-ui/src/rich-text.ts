import type { Format } from "./FormatBar";

/**
 * The small piece of formatting a message carries, written the way people type it: **bold**,
 * *italic*, `code`, [a link](https://…), a line starting "- " for a list and "> " for a quote. A
 * mention is any `@Name` the server resolved for that message.
 */
export type Inline =
	| { readonly kind: "text"; readonly text: string }
	| { readonly kind: "bold"; readonly children: readonly Inline[] }
	| { readonly kind: "italic"; readonly children: readonly Inline[] }
	| { readonly kind: "code"; readonly text: string }
	| { readonly kind: "mention"; readonly text: string }
	| { readonly kind: "link"; readonly text: string; readonly href: string };

export type Block =
	| { readonly kind: "para"; readonly inline: readonly Inline[] }
	| { readonly kind: "quote"; readonly inline: readonly Inline[] }
	| { readonly kind: "list"; readonly items: readonly (readonly Inline[])[] };

export const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function inlinePattern(mentions: readonly string[]): RegExp {
	const parts = [
		"`([^`]+)`",
		"\\*\\*(.+?)\\*\\*",
		"\\*([^*\\s](?:[^*]*?[^*\\s])?)\\*",
		"\\[([^\\]]+)\\]\\((https?://[^\\s)]+)\\)",
	];
	const names = [...mentions].sort((a, b) => b.length - a.length).map(escapeRegExp);
	if (names.length > 0) parts.push(`(?<!\\S)(${names.join("|")})(?!\\w)`);
	return new RegExp(parts.join("|"), "g");
}

function inline(text: string, mentions: readonly string[]): Inline[] {
	const out: Inline[] = [];
	const pattern = inlinePattern(mentions);
	let at = 0;
	for (const m of text.matchAll(pattern)) {
		const start = m.index ?? 0;
		if (start > at) out.push({ kind: "text", text: text.slice(at, start) });
		const [, code, bold, italic, linkText, href, mention] = m;
		if (code !== undefined) out.push({ kind: "code", text: code });
		else if (bold !== undefined) out.push({ kind: "bold", children: inline(bold, mentions) });
		else if (italic !== undefined) out.push({ kind: "italic", children: inline(italic, mentions) });
		else if (linkText !== undefined && href !== undefined)
			out.push({ kind: "link", text: linkText, href });
		else if (mention !== undefined) out.push({ kind: "mention", text: mention });
		at = start + m[0].length;
	}
	if (at < text.length) out.push({ kind: "text", text: text.slice(at) });
	return out;
}

/** `mentions` are the `@Name` texts the server resolved, so an unknown `@word` stays plain. */
export function parseRich(text: string, mentions: readonly string[] = []): Block[] {
	const blocks: Block[] = [];
	for (const line of text.split("\n")) {
		if (line.trim() === "") continue;
		if (line.startsWith("- ")) {
			const item = inline(line.slice(2), mentions);
			const last = blocks.at(-1);
			if (last?.kind === "list")
				blocks[blocks.length - 1] = { ...last, items: [...last.items, item] };
			else blocks.push({ kind: "list", items: [item] });
		} else if (line.startsWith("> ")) {
			blocks.push({ kind: "quote", inline: inline(line.slice(2), mentions) });
		} else blocks.push({ kind: "para", inline: inline(line, mentions) });
	}
	return blocks;
}

export interface Edit {
	readonly text: string;
	/** Where the caret goes, or what stays selected. */
	readonly start: number;
	readonly end: number;
}

const WRAP: Partial<Record<Format, readonly [string, string]>> = {
	bold: ["**", "**"],
	italic: ["*", "*"],
	code: ["`", "`"],
	link: ["[", "](https://)"],
};
const LINE: Partial<Record<Format, string>> = { list: "- ", quote: "> " };

/** What a format bar button does to the text being written, around the selection. */
export function addFormat(text: string, start: number, end: number, kind: Format): Edit {
	const wrap = WRAP[kind];
	if (wrap) {
		const [open, close] = wrap;
		const next = text.slice(0, start) + open + text.slice(start, end) + close + text.slice(end);
		const caret = kind === "link" ? end + open.length + close.length - 1 : end + open.length;
		return kind === "link" || start === end
			? { text: next, start: caret, end: caret }
			: { text: next, start: start + open.length, end: end + open.length };
	}
	const prefix = LINE[kind];
	if (prefix) {
		const lineStart = text.lastIndexOf("\n", start - 1) + 1;
		const next = text.slice(0, lineStart) + prefix + text.slice(lineStart);
		return { text: next, start: start + prefix.length, end: end + prefix.length };
	}
	if (kind !== "mention") return { text, start, end };
	// A mention starts a word, so it opens the picker.
	const gap = start > 0 && !/\s/.test(text[start - 1] ?? "") ? " " : "";
	const next = `${text.slice(0, start)}${gap}@${text.slice(end)}`;
	const caret = start + gap.length + 1;
	return { text: next, start: caret, end: caret };
}
