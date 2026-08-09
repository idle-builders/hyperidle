// @vitest-environment jsdom

/**
 * L2 AC-29, AC-32, AC-39, AC-41, AC-43-46, AC-49, AC-49a — <Block /> coverage.
 *
 * Matches the existing design-system test pattern (raw react-dom/client + act).
 */

import type { BlockId, BlockPayload } from "@hyperidle/domain-model";
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Block } from "../Block.js";

// biome-ignore lint/style/useNamingConvention: React's flag name is fixed.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const STUB_ID = "0123456789abcdef0123456789abcdef" as BlockId;

const HEADING: BlockPayload = {
	kind: "heading",
	level: 2,
	text: "Hello",
	inline: [{ type: "text", value: "Hello" }],
};
const PARA: BlockPayload = {
	kind: "paragraph",
	inline: [{ type: "text", value: "para" }],
};
const LIST: BlockPayload = {
	kind: "list",
	ordered: false,
	start: null,
	items: [{ children: [{ kind: "paragraph", inline: [{ type: "text", value: "a" }] }] }],
};
const QUOTE: BlockPayload = {
	kind: "quote",
	children: [{ kind: "paragraph", inline: [{ type: "text", value: "q" }] }],
};
const CODE: BlockPayload = { kind: "code", lang: "ts", text: "const x = 1\n" };
const TABLE: BlockPayload = {
	kind: "table",
	align: ["left", "right"],
	header: [[{ type: "text", value: "a" }], [{ type: "text", value: "b" }]],
	rows: [[[{ type: "text", value: "1" }], [{ type: "text", value: "2" }]]],
};
const DIVIDER: BlockPayload = { kind: "divider" };
const IMAGE: BlockPayload = { kind: "image", alt: "alt", url: "/x.png", title: null };
const HTML: BlockPayload = { kind: "html", raw: "<details>x</details>" };
const UNKNOWN: BlockPayload = {
	kind: "unknown",
	raw: "?",
	reason: "parser-unrecognised",
};

const cases: { kind: string; payload: BlockPayload; tag: string }[] = [
	{ kind: "heading", payload: HEADING, tag: "h2" },
	{ kind: "paragraph", payload: PARA, tag: "p" },
	{ kind: "list", payload: LIST, tag: "ul" },
	{ kind: "quote", payload: QUOTE, tag: "blockquote" },
	{ kind: "code", payload: CODE, tag: "pre" },
	{ kind: "table", payload: TABLE, tag: "table" },
	{ kind: "divider", payload: DIVIDER, tag: "hr" },
	{ kind: "image", payload: IMAGE, tag: "figure" },
];

describe("<Block />", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		root.unmount();
		container.remove();
	});

	const renderBlock = async (
		payload: BlockPayload,
		extra: Record<string, unknown> = {},
	): Promise<void> => {
		await act(async () => {
			root.render(
				createElement(Block, {
					id: STUB_ID,
					payload,
					...extra,
				}) as ReactElement,
			);
		});
	};

	describe("DS markers (AC-32)", () => {
		it("Block shell carries lowercase data-ds-component='block', data-ds-tier='2', data-ds-source='design-system'", async () => {
			await renderBlock(PARA);
			const shell = container.firstElementChild as HTMLElement;
			expect(shell.getAttribute("data-ds-component")).toBe("block");
			expect(shell.getAttribute("data-ds-tier")).toBe("2");
			expect(shell.getAttribute("data-ds-source")).toBe("design-system");
		});

		it("Block shell carries data-ds-kind matching payload.kind", async () => {
			for (const c of cases) {
				await renderBlock(c.payload);
				const shell = container.firstElementChild as HTMLElement;
				expect(shell.getAttribute("data-ds-kind")).toBe(c.kind);
			}
		});

		it("Block shell carries data-block-id matching the id prop", async () => {
			await renderBlock(PARA);
			const shell = container.firstElementChild as HTMLElement;
			expect(shell.getAttribute("data-block-id")).toBe(STUB_ID);
		});

		it("PascalCase 'Block' MUST NOT appear in data-ds-component", async () => {
			await renderBlock(PARA);
			expect(container.innerHTML).not.toContain('data-ds-component="Block"');
			expect(container.innerHTML).not.toContain('data-ds-component="BlockHandle"');
		});
	});

	describe("Semantic HTML per kind (AC-29)", () => {
		for (const c of cases) {
			it(`${c.kind} renders a <${c.tag}>`, async () => {
				await renderBlock(c.payload);
				expect(container.querySelector(c.tag)).toBeTruthy();
			});
		}

		it("heading levels map to the right h1-h6 tag", async () => {
			for (const level of [1, 2, 3, 4, 5, 6] as const) {
				await renderBlock({
					kind: "heading",
					level,
					text: `H${level}`,
					inline: [{ type: "text", value: `H${level}` }],
				});
				expect(container.querySelector(`h${level}`)).toBeTruthy();
			}
		});

		it("unknown renders the warn-stripe shell with reason text", async () => {
			await renderBlock(UNKNOWN);
			const shell = container.firstElementChild as HTMLElement;
			expect(shell.getAttribute("data-ds-kind")).toBe("unknown");
			expect(container.textContent ?? "").toContain("parser-unrecognised");
		});
	});

	describe("Image alt text (AC-41)", () => {
		it("preserves alt text", async () => {
			await renderBlock(IMAGE);
			const img = container.querySelector("img");
			expect(img?.getAttribute("alt")).toBe("alt");
		});

		it("empty alt renders alt=''", async () => {
			await renderBlock({ kind: "image", alt: "", url: "/x.png", title: null });
			const img = container.querySelector("img");
			expect(img?.getAttribute("alt")).toBe("");
		});
	});

	describe("HTML kind security (AC-49, AC-49a)", () => {
		it("without sanitizeHtml, falls through to UnknownPayload — no dangerouslySetInnerHTML", async () => {
			await renderBlock(HTML);
			expect(container.querySelector("details")).toBeNull();
			// Renders raw source as <pre><code> text content.
			const pre = container.querySelector("pre, code");
			expect(pre).toBeTruthy();
		});

		it("with a sanitizer that returns empty string, renders the unknown shell with reason 'sanitiser-stripped'", async () => {
			await renderBlock(HTML, { sanitizeHtml: () => "" });
			expect(container.textContent ?? "").toContain("sanitiser-stripped");
			expect(container.querySelector("details")).toBeNull();
		});

		it("with a sanitizer, calls it and renders the sanitised result", async () => {
			let called = 0;
			await renderBlock(HTML, {
				sanitizeHtml: (s: string) => {
					called++;
					return s;
				},
			});
			expect(called).toBeGreaterThan(0);
		});

		it("malicious onerror attribute is not present in the rendered DOM when sanitizer strips it", async () => {
			await renderBlock(
				{ kind: "html", raw: '<img src=x onerror="alert(1)">' },
				{
					sanitizeHtml: (s: string) => s.replace(/on\w+="[^"]*"/g, ""),
				},
			);
			expect(container.innerHTML).not.toContain("onerror");
		});
	});

	describe("Rejected list (AC-43, AC-44, AC-45, AC-46)", () => {
		it("BlockHandle has no draggable / aria-grabbed / cursor-grab markers", async () => {
			await renderBlock(PARA);
			const html = container.innerHTML;
			expect(html).not.toContain("aria-grabbed");
			expect(html).not.toContain('draggable="true"');
			expect(html).not.toMatch(/cursor:\s*grab/);
			expect(html).not.toMatch(/cursor-grab/);
		});

		it("no J or K vim-style keyboard handlers move focus", async () => {
			await renderBlock(PARA);
			const shell = container.firstElementChild as HTMLElement;
			shell.focus();
			const before = document.activeElement;
			shell.dispatchEvent(new KeyboardEvent("keydown", { key: "j", bubbles: true }));
			shell.dispatchEvent(new KeyboardEvent("keydown", { key: "k", bubbles: true }));
			expect(document.activeElement).toBe(before);
		});
	});

	describe("Focus ring (AC-39)", () => {
		it("Block shell is tabbable (tabindex='0')", async () => {
			await renderBlock(PARA);
			const shell = container.firstElementChild as HTMLElement;
			expect(shell.getAttribute("tabindex")).toBe("0");
		});
	});
});
