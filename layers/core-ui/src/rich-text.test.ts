/** How a message's typed formatting reads back, and what each format bar button writes. */
import { describe, expect, test } from "vitest";
import { addFormat, parseRich } from "./rich-text";

describe("parseRich", () => {
	test.each([
		{
			label: "bold, italic, code and a link inside a line",
			text: "Went with **Your first bill**, *for now*, see `proration.ts` and [the page](https://x.co/p)",
			mentions: [],
			blocks: [
				{
					kind: "para",
					inline: [
						{ kind: "text", text: "Went with " },
						{ kind: "bold", children: [{ kind: "text", text: "Your first bill" }] },
						{ kind: "text", text: ", " },
						{ kind: "italic", children: [{ kind: "text", text: "for now" }] },
						{ kind: "text", text: ", see " },
						{ kind: "code", text: "proration.ts" },
						{ kind: "text", text: " and " },
						{ kind: "link", text: "the page", href: "https://x.co/p" },
					],
				},
			],
		},
		{
			label: "only a mention the server resolved is one, the longest name winning",
			text: "@Maya Chen and @Maya, not @nobody or me@maya.co",
			mentions: ["@Maya", "@Maya Chen"],
			blocks: [
				{
					kind: "para",
					inline: [
						{ kind: "mention", text: "@Maya Chen" },
						{ kind: "text", text: " and " },
						{ kind: "mention", text: "@Maya" },
						{ kind: "text", text: ", not @nobody or me@maya.co" },
					],
				},
			],
		},
		{
			label: "lines starting '- ' make one list, '> ' a quote, blank lines nothing",
			text: "Two things:\n\n- one\n- two\n> said so",
			mentions: [],
			blocks: [
				{ kind: "para", inline: [{ kind: "text", text: "Two things:" }] },
				{
					kind: "list",
					items: [[{ kind: "text", text: "one" }], [{ kind: "text", text: "two" }]],
				},
				{ kind: "quote", inline: [{ kind: "text", text: "said so" }] },
			],
		},
	])("$label", ({ text, mentions, blocks }) => {
		expect(parseRich(text, mentions)).toEqual(blocks);
	});
});

describe("addFormat", () => {
	test.each([
		{ kind: "bold", text: "a word", sel: [2, 6], out: { text: "a **word**", start: 4, end: 8 } },
		{ kind: "italic", text: "ab", sel: [2, 2], out: { text: "ab**", start: 3, end: 3 } },
		{
			kind: "link",
			text: "see",
			sel: [0, 3],
			out: { text: "[see](https://)", start: 14, end: 14 },
		},
		{ kind: "list", text: "a\nb", sel: [3, 3], out: { text: "a\n- b", start: 5, end: 5 } },
		{ kind: "mention", text: "hi", sel: [2, 2], out: { text: "hi @", start: 4, end: 4 } },
	] as const)("$kind", ({ kind, text, sel, out }) => {
		expect(addFormat(text, sel[0], sel[1], kind)).toEqual(out);
	});
});
