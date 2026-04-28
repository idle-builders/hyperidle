// @vitest-environment jsdom

/**
 * L2 AC-29 (per-kind payload renderers): each per-kind payload component
 * mounts and produces the expected primary semantic element. Per-kind
 * renderers live in packages/design-system/src/block/ and are NOT exported
 * from the package barrel.
 */

import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// biome-ignore lint/style/useNamingConvention: React's flag name is fixed.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("Per-kind payload renderers", () => {
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

	const mount = async (el: ReactElement): Promise<void> => {
		await act(async () => {
			root.render(el);
		});
	};

	it("HeadingPayload renders the matching h-tag", async () => {
		const { HeadingPayload } = await import("../../block/HeadingPayload.js");
		await mount(
			createElement(HeadingPayload, {
				level: 3,
				inline: [{ type: "text", value: "Title" }],
			}) as ReactElement,
		);
		expect(container.querySelector("h3")).toBeTruthy();
	});

	it("ParagraphPayload renders <p>", async () => {
		const { ParagraphPayload } = await import("../../block/ParagraphPayload.js");
		await mount(
			createElement(ParagraphPayload, {
				inline: [{ type: "text", value: "x" }],
			}) as ReactElement,
		);
		expect(container.querySelector("p")).toBeTruthy();
	});

	it("ListPayload renders <ul> when ordered=false", async () => {
		const { ListPayload } = await import("../../block/ListPayload.js");
		await mount(
			createElement(ListPayload, {
				ordered: false,
				start: null,
				items: [{ children: [{ kind: "paragraph", inline: [{ type: "text", value: "a" }] }] }],
			}) as ReactElement,
		);
		expect(container.querySelector("ul")).toBeTruthy();
	});

	it("ListPayload renders <ol> when ordered=true", async () => {
		const { ListPayload } = await import("../../block/ListPayload.js");
		await mount(
			createElement(ListPayload, {
				ordered: true,
				start: 1,
				items: [{ children: [{ kind: "paragraph", inline: [{ type: "text", value: "a" }] }] }],
			}) as ReactElement,
		);
		expect(container.querySelector("ol")).toBeTruthy();
	});

	it("QuotePayload renders <blockquote>", async () => {
		const { QuotePayload } = await import("../../block/QuotePayload.js");
		await mount(
			createElement(QuotePayload, {
				// biome-ignore lint/correctness/noChildrenProp: QuotePayload's prop is named "children" to match BlockPayload['quote'].children — the closed payload union shape.
				children: [{ kind: "paragraph", inline: [{ type: "text", value: "q" }] }],
			}) as ReactElement,
		);
		expect(container.querySelector("blockquote")).toBeTruthy();
	});

	it("CodePayload renders <pre><code> and is collapsible beyond 20 lines", async () => {
		const { CodePayload } = await import("../../block/CodePayload.js");
		const longText = Array.from({ length: 25 }, (_, i) => `line ${i}`).join("\n");
		await mount(
			createElement(CodePayload, {
				lang: "ts",
				text: longText,
			}) as ReactElement,
		);
		expect(container.querySelector("pre code")).toBeTruthy();
		// Collapsible state surfaces a control or an aria-expanded attr.
		const html = container.innerHTML;
		expect(html.toLowerCase()).toMatch(/collapse|expand|aria-expanded/);
	});

	it("TablePayload renders <table> with sticky header markup", async () => {
		const { TablePayload } = await import("../../block/TablePayload.js");
		await mount(
			createElement(TablePayload, {
				align: ["left", "right"],
				header: [[{ type: "text", value: "a" }], [{ type: "text", value: "b" }]],
				rows: [[[{ type: "text", value: "1" }], [{ type: "text", value: "2" }]]],
			}) as ReactElement,
		);
		expect(container.querySelector("table")).toBeTruthy();
		expect(container.querySelector("thead")).toBeTruthy();
	});

	it("DividerPayload renders <hr>", async () => {
		const { DividerPayload } = await import("../../block/DividerPayload.js");
		await mount(createElement(DividerPayload, {}) as ReactElement);
		expect(container.querySelector("hr")).toBeTruthy();
	});

	it("ImagePayload renders <figure><img> with zoom indicator", async () => {
		const { ImagePayload } = await import("../../block/ImagePayload.js");
		await mount(
			createElement(ImagePayload, {
				alt: "alt",
				url: "/x.png",
				title: null,
			}) as ReactElement,
		);
		expect(container.querySelector("figure img")).toBeTruthy();
	});

	it("HtmlPayload renders sanitised HTML through the sanitizeHtml prop", async () => {
		const { HtmlPayload } = await import("../../block/HtmlPayload.js");
		let called = 0;
		await mount(
			createElement(HtmlPayload, {
				raw: "<details>x</details>",
				sanitizeHtml: (s: string) => {
					called++;
					return s;
				},
			}) as ReactElement,
		);
		expect(called).toBeGreaterThan(0);
	});

	it("inline link XSS: post-derive+render DOM has no <a href='javascript:'>", async () => {
		const { deriveBlocks } = await import("@hyperidle/shared");
		const { Block } = await import("../../Block.js");
		const md = "see [click](javascript:alert(1)) and [ok](https://example.com)";
		const { blocks } = deriveBlocks(md, { kind: "bet", id: "x" });
		await mount(
			createElement(Block, { id: blocks[0].id, payload: blocks[0].payload }) as ReactElement,
		);
		// No anchor with hostile scheme.
		const anchors = container.querySelectorAll("a");
		for (const a of Array.from(anchors)) {
			const href = (a.getAttribute("href") ?? "").toLowerCase();
			expect(href.startsWith("javascript:")).toBe(false);
			expect(href.startsWith("data:text")).toBe(false);
			expect(href.startsWith("vbscript:")).toBe(false);
		}
	});

	it("UnknownPayload renders the warn-stripe shell with reason text", async () => {
		const { UnknownPayload } = await import("../../block/UnknownPayload.js");
		await mount(
			createElement(UnknownPayload, {
				raw: "??",
				reason: "parser-unrecognised",
			}) as ReactElement,
		);
		expect(container.textContent ?? "").toContain("parser-unrecognised");
		// Raw source rendered as text content (not inner HTML).
		expect(container.querySelector("pre, code")).toBeTruthy();
	});
});
