import { describe, expect, it } from "vitest";
import { stripMarkdown } from "../format/strip-markdown.js";

describe("stripMarkdown", () => {
	it("returns plain text unchanged", () => {
		expect(stripMarkdown("Hello world")).toBe("Hello world");
	});

	it("removes ATX headings (#, ##, ###)", () => {
		expect(stripMarkdown("# Title")).toBe("Title");
		expect(stripMarkdown("## Section")).toBe("Section");
		expect(stripMarkdown("### Sub")).toBe("Sub");
	});

	it("removes setext heading underlines", () => {
		expect(stripMarkdown("Title\n===")).toBe("Title");
		expect(stripMarkdown("Title\n---")).toBe("Title");
	});

	it("removes bold markers (**text** and __text__)", () => {
		expect(stripMarkdown("**bold**")).toBe("bold");
		expect(stripMarkdown("__bold__")).toBe("bold");
	});

	it("removes italic markers (*text* and _text_)", () => {
		expect(stripMarkdown("*italic*")).toBe("italic");
		expect(stripMarkdown("_italic_")).toBe("italic");
	});

	it("removes inline code backticks", () => {
		expect(stripMarkdown("`code`")).toBe("code");
	});

	it("removes blockquote markers", () => {
		expect(stripMarkdown("> quote")).toBe("quote");
		expect(stripMarkdown(">quote")).toBe("quote");
	});

	it("removes unordered list bullets", () => {
		expect(stripMarkdown("- item")).toBe("item");
		expect(stripMarkdown("* item")).toBe("item");
		expect(stripMarkdown("+ item")).toBe("item");
	});

	it("removes ordered list numbers", () => {
		expect(stripMarkdown("1. first")).toBe("first");
		expect(stripMarkdown("10. tenth")).toBe("tenth");
	});

	it("converts links to their display text", () => {
		expect(stripMarkdown("[click here](https://example.com)")).toBe("click here");
	});

	it("converts images to their alt text", () => {
		expect(stripMarkdown("![logo](https://example.com/img.png)")).toBe("logo");
	});

	it("collapses newlines into spaces", () => {
		expect(stripMarkdown("line one\nline two")).toBe("line one line two");
	});

	it("strips a realistic multi-element markdown snippet", () => {
		const md = "## Summary\n\nThis is **important** and `code` here.\n\n- bullet";
		expect(stripMarkdown(md)).toBe("Summary This is important and code here. bullet");
	});

	it("handles empty string", () => {
		expect(stripMarkdown("")).toBe("");
	});

	it("removes dangling unclosed emphasis markers in truncated excerpts", () => {
		// Knowledge excerpts are clipped mid-word, leaving an unclosed * or _
		expect(stripMarkdown("answer *what are user")).toBe("answer what are user");
		expect(stripMarkdown("answer _what are user")).toBe("answer what are user");
	});
});
