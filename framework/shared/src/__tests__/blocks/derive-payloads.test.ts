/**
 * R3 — `derivePayloads` unit tests (AC-1 through AC-8, AC-16).
 *
 * Tests written BEFORE implementation (TDD red phase). Every test here
 * fails until `framework/shared/src/blocks/derive-payloads.ts` is created
 * and exported from the barrel.
 *
 * derivePayloads: markdown text → BlockPayload[] with NO Block identity
 * (no id, no source, no anchor). Image payloads are downgraded to
 * paragraph with alt text (R3 constraint: no image rendering in messages).
 */

import { describe, expect, expectTypeOf, it } from "vitest";
import { type BlockPayload, derivePayloads } from "../../blocks/index.js";

// ---------------------------------------------------------------------------
// AC-1: derivePayloads exists, is callable, returns BlockPayload[]
// ---------------------------------------------------------------------------

describe("derivePayloads() — existence and return type (AC-1)", () => {
	it("is exported from @hyperidle/shared blocks barrel", () => {
		expect(typeof derivePayloads).toBe("function");
	});

	it("returns an array", () => {
		const result = derivePayloads("hello");
		expect(Array.isArray(result)).toBe(true);
	});

	it("return type is assignable to BlockPayload[]", () => {
		expectTypeOf(derivePayloads).returns.toEqualTypeOf<BlockPayload[]>();
	});

	it("returned elements have a `kind` discriminant", () => {
		const payloads = derivePayloads("hello world");
		expect(payloads.length).toBeGreaterThan(0);
		for (const p of payloads) {
			expect(typeof p.kind).toBe("string");
		}
	});
});

// ---------------------------------------------------------------------------
// AC-8: No Block identity fields in output (type-level)
// ---------------------------------------------------------------------------

describe("derivePayloads() — no Block identity fields (AC-8)", () => {
	it("returned objects have no `id` field", () => {
		const payloads = derivePayloads("hello");
		for (const p of payloads) {
			expect("id" in p).toBe(false);
		}
	});

	it("returned objects have no `source` field", () => {
		const payloads = derivePayloads("hello");
		for (const p of payloads) {
			expect("source" in p).toBe(false);
		}
	});

	it("returned objects have no `anchor` field", () => {
		const payloads = derivePayloads("hello");
		for (const p of payloads) {
			expect("anchor" in p).toBe(false);
		}
	});

	it("returned objects have no `order` field", () => {
		const payloads = derivePayloads("hello");
		for (const p of payloads) {
			expect("order" in p).toBe(false);
		}
	});
});

// ---------------------------------------------------------------------------
// AC-7: Empty/whitespace-only input returns []
// ---------------------------------------------------------------------------

describe("derivePayloads() — empty and whitespace input (AC-7)", () => {
	it("empty string returns []", () => {
		expect(derivePayloads("")).toEqual([]);
	});

	it("whitespace-only string returns []", () => {
		expect(derivePayloads("   ")).toEqual([]);
	});

	it("tab-only string returns []", () => {
		expect(derivePayloads("\t")).toEqual([]);
	});

	it("newline-only string returns []", () => {
		expect(derivePayloads("\n\n\n")).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// AC-2: Fenced code blocks → { kind: "code", lang, text }
// ---------------------------------------------------------------------------

describe("derivePayloads() — fenced code blocks (AC-2)", () => {
	it("parses a TypeScript fenced code block", () => {
		const md = "```ts\nconst x = 1;\n```\n";
		const payloads = derivePayloads(md);
		expect(payloads).toHaveLength(1);
		const p = payloads[0]!;
		expect(p.kind).toBe("code");
		if (p.kind !== "code") throw new Error("expected code payload");
		expect(p.lang).toBe("ts");
		expect(p.text).toContain("const x = 1;");
	});

	it("parses a code block with no language tag", () => {
		const md = "```\nsome code\n```\n";
		const payloads = derivePayloads(md);
		expect(payloads).toHaveLength(1);
		const p = payloads[0]!;
		expect(p.kind).toBe("code");
		if (p.kind !== "code") throw new Error("expected code payload");
		expect(p.lang === null || p.lang === "").toBe(true);
		expect(p.text).toContain("some code");
	});

	it("normalises CRLF in code blocks to LF", () => {
		const md = "```js\r\nconst y = 2\r\n```\r\n";
		const payloads = derivePayloads(md);
		expect(payloads).toHaveLength(1);
		const p = payloads[0]!;
		if (p.kind !== "code") throw new Error("expected code payload");
		expect(p.text).not.toContain("\r");
	});

	it("parses bash fenced code block", () => {
		const md = "```bash\nnpm install\n```\n";
		const payloads = derivePayloads(md);
		expect(payloads).toHaveLength(1);
		const p = payloads[0]!;
		if (p.kind !== "code") throw new Error("expected code payload");
		expect(p.lang).toBe("bash");
	});
});

// ---------------------------------------------------------------------------
// AC-3: Bold, italic, inline code, links → correct inline nodes
// ---------------------------------------------------------------------------

describe("derivePayloads() — inline nodes in paragraphs (AC-3)", () => {
	it("parses bold text → strong inline node", () => {
		const payloads = derivePayloads("**bold text**");
		expect(payloads).toHaveLength(1);
		const p = payloads[0]!;
		if (p.kind !== "paragraph") throw new Error("expected paragraph");
		const types = p.inline.map((n) => n.type);
		expect(types).toContain("strong");
	});

	it("parses italic text → emphasis inline node", () => {
		const payloads = derivePayloads("*italic text*");
		expect(payloads).toHaveLength(1);
		const p = payloads[0]!;
		if (p.kind !== "paragraph") throw new Error("expected paragraph");
		const types = p.inline.map((n) => n.type);
		expect(types).toContain("emphasis");
	});

	it("parses inline code → inlineCode inline node", () => {
		const payloads = derivePayloads("`const x = 1`");
		expect(payloads).toHaveLength(1);
		const p = payloads[0]!;
		if (p.kind !== "paragraph") throw new Error("expected paragraph");
		const types = p.inline.map((n) => n.type);
		expect(types).toContain("inlineCode");
		const codeNode = p.inline.find((n) => n.type === "inlineCode");
		if (!codeNode || codeNode.type !== "inlineCode") throw new Error();
		expect(codeNode.value).toBe("const x = 1");
	});

	it("parses a safe link → link inline node with href", () => {
		const payloads = derivePayloads("[Example](https://example.com)");
		expect(payloads).toHaveLength(1);
		const p = payloads[0]!;
		if (p.kind !== "paragraph") throw new Error("expected paragraph");
		const linkNode = p.inline.find((n) => n.type === "link");
		expect(linkNode).toBeDefined();
		if (!linkNode || linkNode.type !== "link") throw new Error();
		expect(linkNode.href).toBe("https://example.com");
	});

	it("parses a paragraph with all four inline types", () => {
		const md = "**bold** and *italic* and `code` and [link](https://example.com)";
		const payloads = derivePayloads(md);
		expect(payloads).toHaveLength(1);
		const p = payloads[0]!;
		if (p.kind !== "paragraph") throw new Error("expected paragraph");
		const types = p.inline.map((n) => n.type);
		expect(types).toContain("strong");
		expect(types).toContain("emphasis");
		expect(types).toContain("inlineCode");
		expect(types).toContain("link");
	});
});

// ---------------------------------------------------------------------------
// AC-4: Lists (ordered/unordered) → list payloads
// ---------------------------------------------------------------------------

describe("derivePayloads() — lists (AC-4)", () => {
	it("parses an unordered list", () => {
		const md = "- item a\n- item b\n";
		const payloads = derivePayloads(md);
		expect(payloads).toHaveLength(1);
		const p = payloads[0]!;
		expect(p.kind).toBe("list");
		if (p.kind !== "list") throw new Error("expected list");
		expect(p.ordered).toBe(false);
		expect(p.items).toHaveLength(2);
	});

	it("parses an ordered list", () => {
		const md = "1. first\n2. second\n3. third\n";
		const payloads = derivePayloads(md);
		expect(payloads).toHaveLength(1);
		const p = payloads[0]!;
		expect(p.kind).toBe("list");
		if (p.kind !== "list") throw new Error("expected list");
		expect(p.ordered).toBe(true);
		expect(p.items).toHaveLength(3);
	});

	it("unordered and ordered lists in the same text produce 2 list payloads", () => {
		const md = "- a\n- b\n\n1. one\n2. two\n";
		const payloads = derivePayloads(md);
		const lists = payloads.filter((p) => p.kind === "list");
		expect(lists).toHaveLength(2);
		const bullet = lists[0]!;
		const ordered = lists[1]!;
		if (bullet.kind !== "list" || ordered.kind !== "list") throw new Error();
		expect(bullet.ordered).toBe(false);
		expect(ordered.ordered).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// AC-5: Headings h1-h6 → heading payloads with correct level
// ---------------------------------------------------------------------------

describe("derivePayloads() — headings (AC-5)", () => {
	it("parses h1", () => {
		const payloads = derivePayloads("# H1 title");
		expect(payloads).toHaveLength(1);
		const p = payloads[0]!;
		expect(p.kind).toBe("heading");
		if (p.kind !== "heading") throw new Error();
		expect(p.level).toBe(1);
	});

	it("parses h2", () => {
		const payloads = derivePayloads("## H2 title");
		expect(payloads).toHaveLength(1);
		const p = payloads[0]!;
		if (p.kind !== "heading") throw new Error();
		expect(p.level).toBe(2);
	});

	it("parses h3 through h6", () => {
		for (let i = 3; i <= 6; i++) {
			const hashes = "#".repeat(i);
			const payloads = derivePayloads(`${hashes} Heading ${i}`);
			expect(payloads).toHaveLength(1);
			const p = payloads[0]!;
			expect(p.kind).toBe("heading");
			if (p.kind !== "heading") throw new Error();
			expect(p.level).toBe(i as 1 | 2 | 3 | 4 | 5 | 6);
		}
	});

	it("parses all 6 heading levels from a single document", () => {
		const md = "# H1\n\n## H2\n\n### H3\n\n#### H4\n\n##### H5\n\n###### H6\n";
		const payloads = derivePayloads(md);
		const headings = payloads.filter((p) => p.kind === "heading");
		expect(headings).toHaveLength(6);
		for (let i = 0; i < 6; i++) {
			const h = headings[i]!;
			if (h.kind !== "heading") throw new Error();
			expect(h.level).toBe(i + 1);
		}
	});
});

// ---------------------------------------------------------------------------
// AC-6: Image → downgraded to paragraph with alt text
// ---------------------------------------------------------------------------

describe("derivePayloads() — image downgrade (AC-6)", () => {
	it("degrades an image to a paragraph containing the alt text", () => {
		const md = "![screenshot](https://example.com/img.png)";
		const payloads = derivePayloads(md);
		expect(payloads).toHaveLength(1);
		const p = payloads[0]!;
		// Must NOT be an image payload
		expect(p.kind).not.toBe("image");
		// Must be a paragraph
		expect(p.kind).toBe("paragraph");
		if (p.kind !== "paragraph") throw new Error("expected paragraph");
		// Alt text should be present as a text inline node
		const flat = JSON.stringify(p.inline);
		expect(flat).toContain("screenshot");
	});

	it("drops an image with empty alt text entirely (no payload emitted)", () => {
		const md = "![](https://example.com/img.png)";
		const payloads = derivePayloads(md);
		// An image with no alt text produces no payload
		expect(payloads).toHaveLength(0);
	});

	it("does not emit image payloads (always downgrades)", () => {
		const cases = [
			"![alt text](https://example.com/a.png)",
			"![logo](/logo.png)",
			"![data](data:image/png;base64,abc=)",
		];
		for (const md of cases) {
			const payloads = derivePayloads(md);
			for (const p of payloads) {
				expect(p.kind).not.toBe("image");
			}
		}
	});
});

// ---------------------------------------------------------------------------
// AC-16: javascript: URLs stripped from links
// ---------------------------------------------------------------------------

describe("derivePayloads() — URL security (AC-16)", () => {
	it("strips javascript: links — degrades link node to plain text", () => {
		const md = "[click](javascript:alert(1))";
		const payloads = derivePayloads(md);
		expect(payloads).toHaveLength(1);
		const p = payloads[0]!;
		if (p.kind !== "paragraph") throw new Error("expected paragraph");
		// No link node — the hostile URL is stripped
		for (const node of p.inline) {
			expect(node.type).not.toBe("link");
		}
		// The link text "click" must still be present
		const flat = JSON.stringify(p.inline);
		expect(flat.toLowerCase()).toContain("click");
	});

	it("strips data: text/html links", () => {
		const md = "[click](data:text/html,<script>alert(1)</script>)";
		const payloads = derivePayloads(md);
		expect(payloads).toHaveLength(1);
		const p = payloads[0]!;
		if (p.kind !== "paragraph") throw new Error();
		for (const node of p.inline) {
			expect(node.type).not.toBe("link");
		}
	});

	it("strips vbscript: links", () => {
		const md = "[click](vbscript:msgbox(1))";
		const payloads = derivePayloads(md);
		expect(payloads).toHaveLength(1);
		const p = payloads[0]!;
		if (p.kind !== "paragraph") throw new Error();
		for (const node of p.inline) {
			expect(node.type).not.toBe("link");
		}
	});

	it("preserves safe http/https links", () => {
		const cases = [
			"[click](http://example.com)",
			"[click](https://example.com)",
			"[click](mailto:foo@bar.com)",
			"[click](#fragment)",
		];
		for (const md of cases) {
			const payloads = derivePayloads(md);
			const p = payloads[0]!;
			if (!p || p.kind !== "paragraph") throw new Error("expected paragraph");
			const hasLink = p.inline.some((n) => n.type === "link");
			expect(hasLink).toBe(true);
		}
	});
});

// ---------------------------------------------------------------------------
// Additional edge cases and mixed content
// ---------------------------------------------------------------------------

describe("derivePayloads() — plain text and mixed content", () => {
	it("plain text produces a single paragraph payload", () => {
		const payloads = derivePayloads("hello world");
		expect(payloads).toHaveLength(1);
		const p = payloads[0]!;
		expect(p.kind).toBe("paragraph");
	});

	it("mixed content (paragraph + code + list) produces correct sequence", () => {
		const md = "Some text\n\n```ts\nconst x = 1\n```\n\n- a\n- b\n";
		const payloads = derivePayloads(md);
		const kinds = payloads.map((p) => p.kind);
		expect(kinds).toContain("paragraph");
		expect(kinds).toContain("code");
		expect(kinds).toContain("list");
		// Paragraph comes first
		expect(kinds[0]!).toBe("paragraph");
	});

	it("blockquote produces a quote payload", () => {
		const md = "> quoted text";
		const payloads = derivePayloads(md);
		expect(payloads).toHaveLength(1);
		expect(payloads[0]!.kind).toBe("quote");
	});

	it("divider (---) produces a divider payload", () => {
		const md = "---\n";
		const payloads = derivePayloads(md);
		expect(payloads).toHaveLength(1);
		expect(payloads[0]!.kind).toBe("divider");
	});

	it("GFM table produces a table payload", () => {
		const md = "| a | b |\n| :- | -: |\n| 1 | 2 |\n";
		const payloads = derivePayloads(md);
		expect(payloads).toHaveLength(1);
		const p = payloads[0]!;
		expect(p.kind).toBe("table");
		if (p.kind !== "table") throw new Error();
		expect(p.align).toEqual(["left", "right"]);
		expect(p.rows).toHaveLength(1);
	});

	it("raw HTML block produces an html payload", () => {
		const md = "<details><summary>x</summary>y</details>";
		const payloads = derivePayloads(md);
		const htmlPayload = payloads.find((p) => p.kind === "html");
		expect(htmlPayload).toBeDefined();
		if (!htmlPayload || htmlPayload.kind !== "html") throw new Error();
		expect(htmlPayload.raw).toContain("<details>");
	});
});
