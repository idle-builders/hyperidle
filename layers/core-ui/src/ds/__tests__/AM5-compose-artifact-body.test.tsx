// AM5 T3 — Tests for composeArtifactBody (the Artifact composition).
// Also tests the negative existence of getRenderer/kind renderers (AC-COLLAPSE).
// RED phase — these fail until composeArtifactBody is created and kind layer removed.

import * as DesignSystem from "@hyperidle/design-system";
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

// This import will fail until composeArtifactBody is created
import { composeArtifactBody } from "../kinds/compose-artifact-body.js";

afterEach(cleanup);

describe("composeArtifactBody (Artifact composition)", () => {
	it("'code' kind → renders CodePayload (lang + text visible)", () => {
		const preview = {
			kind: "code",
			path: "src/hello.ts",
			lang: "typescript",
			text: "const x = 1;",
		};
		const { container } = render(<>{composeArtifactBody("code", preview)}</>);
		// CodePayload renders a pre block with the code text
		expect(container.querySelector("pre")).toBeTruthy();
		expect(container.textContent).toContain("const x = 1;");
	});

	it("'image' kind → renders an img element", () => {
		const preview = {
			kind: "image",
			url: "https://example.com/img.png",
			width: 800,
			height: 600,
			alt: "Test image",
		};
		render(<>{composeArtifactBody("image", preview)}</>);
		expect(screen.getByRole("img")).toBeTruthy();
	});

	it("'url' kind → renders an anchor link", () => {
		const preview = { kind: "url", url: "https://example.com/service" };
		const { container } = render(<>{composeArtifactBody("url", preview)}</>);
		const link = container.querySelector("a");
		expect(link).toBeTruthy();
		expect(link?.getAttribute("href")).toBe("https://example.com/service");
	});

	// AZ6: the html kind is no longer sanitised into the app's own document. It is a
	// self-contained page and runs whole inside a sealed frame; stripping its scripts
	// deleted the thing that made it worth opening.
	it("'html' kind → runs as its own document in a sealed frame", () => {
		const preview = { kind: "html", html: "<p>Hello</p>" };
		const { container } = render(<>{composeArtifactBody("html", preview)}</>);
		const frame = container.querySelector("iframe");
		expect(frame?.getAttribute("sandbox")).toBe("allow-scripts");
		expect(frame?.getAttribute("srcdoc") ?? "").toContain("<p>Hello</p>");
	});

	it("'html' kind → needs no sanitiser, because isolation replaced stripping", () => {
		const preview = { kind: "html", html: "<p>Hello</p><script>1</script>" };
		const { container } = render(<>{composeArtifactBody("html", preview)}</>);
		expect(container.querySelector("[data-block-unknown-pill]")).toBeNull();
		expect(container.querySelector("iframe")?.getAttribute("srcdoc") ?? "").toContain(
			"<script>1</script>",
		);
	});

	it("unknown kind → renders the designed unrenderable state (K1 fallback, never crashes)", () => {
		const preview = { kind: "mystery_kind", data: "something" };
		const { container } = render(<>{composeArtifactBody("mystery_kind", preview)}</>);
		expect(container.querySelector("[data-artifact-unrenderable]")).toBeTruthy();
	});

	it("AC5: composeArtifactBody('mystery', …) → the unrenderable state, never throws", () => {
		// K1: unknown content → fallback, never crash
		expect(() => {
			render(<>{composeArtifactBody("mystery", { kind: "mystery" })}</>);
		}).not.toThrow();
	});

	// T5: text renders Block stream (not flat whitespace-pre-wrap div)
	it("'text' kind with heading → renders Block stream (article elements, not flat div)", () => {
		const preview = {
			kind: "text",
			body: "# Hello World\n\nThis is a paragraph.\n\n- item one\n- item two",
		};
		const { container } = render(<>{composeArtifactBody("text", preview)}</>);
		// Block component renders <article data-ds-component="block"> per block
		const blocks = container.querySelectorAll("[data-ds-component='block']");
		// heading + paragraph + list = 3 blocks
		expect(blocks.length).toBeGreaterThanOrEqual(2);
		// text content must be present (not empty)
		expect(container.textContent).toContain("Hello World");
		expect(container.textContent).toContain("paragraph");
	});

	it("'text' kind renders via Block (article elements), NOT a flat div with whitespace-pre-wrap", () => {
		const preview = { kind: "text", body: "Just a simple line." };
		const { container } = render(<>{composeArtifactBody("text", preview)}</>);
		// Must have at least one block (article), not a flat div with pre-wrap
		const blocks = container.querySelectorAll("[data-ds-component='block']");
		expect(blocks.length).toBeGreaterThanOrEqual(1);
		// Must NOT be the old flat whitespace-pre-wrap div (the text-renderer.tsx approach)
		const flatDiv = container.querySelector(".whitespace-pre-wrap");
		expect(flatDiv).toBeNull();
	});

	// T5: data renders KpiStat + rows + Sparkline
	it("'data' kind with headlines → renders KpiStat (section[aria-label])", () => {
		const preview = {
			kind: "data",
			headlines: [
				{ label: "DAU", value: "1.2k" },
				{ label: "MRR", value: "$48k" },
			],
		};
		const { container } = render(<>{composeArtifactBody("data", preview)}</>);
		// KpiStat renders section[aria-label="Key metrics"]
		const kpiSection = container.querySelector("section[aria-label='Key metrics']");
		expect(kpiSection).toBeTruthy();
		expect(container.textContent).toContain("DAU");
		expect(container.textContent).toContain("1.2k");
	});

	it("'data' kind with charts → renders Sparkline (SVG)", () => {
		const preview = {
			kind: "data",
			headlines: [{ label: "MAU", value: "5k" }],
			charts: [{ label: "trend", values: [1, 2, 3, 4, 5] }],
		};
		const { container } = render(<>{composeArtifactBody("data", preview)}</>);
		// Sparkline renders role="img" SVG
		const sparkline = container.querySelector("svg[role='img']");
		expect(sparkline).toBeTruthy();
	});

	it("'data' kind with rows → renders rows table (table element)", () => {
		const preview = {
			kind: "data",
			headlines: [{ label: "Rows", value: "2" }],
			rows: [
				{ name: "Alice", score: "95" },
				{ name: "Bob", score: "87" },
			],
		};
		const { container } = render(<>{composeArtifactBody("data", preview)}</>);
		// DataRowsTable renders a <table>
		const table = container.querySelector("table");
		expect(table).toBeTruthy();
		expect(container.textContent).toContain("Alice");
	});
});

describe("AC-COLLAPSE: getRenderer / kind renderers removed from barrel", () => {
	it("barrel does NOT export getRenderer (K5 negative existence)", () => {
		// @ts-expect-error getRenderer should not exist in the barrel after collapse
		expect(DesignSystem.getRenderer).toBeUndefined();
	});

	it("barrel does NOT export CodeRenderer (K5 negative existence)", () => {
		// @ts-expect-error CodeRenderer should not exist
		expect(DesignSystem.CodeRenderer).toBeUndefined();
	});

	it("barrel does NOT export TextRenderer (K5 negative existence)", () => {
		// @ts-expect-error TextRenderer should not exist
		expect(DesignSystem.TextRenderer).toBeUndefined();
	});

	it("barrel does NOT export DataRenderer (K5 negative existence)", () => {
		// @ts-expect-error DataRenderer should not exist
		expect(DesignSystem.DataRenderer).toBeUndefined();
	});

	it("barrel DOES export composeArtifactBody (the replacement)", () => {
		expect(DesignSystem.composeArtifactBody).toBeDefined();
	});
});
