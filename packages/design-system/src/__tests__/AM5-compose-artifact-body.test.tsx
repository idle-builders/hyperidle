// AM5 T3 — Tests for composeArtifactBody (the Artifact composition).
// Also tests the negative existence of getRenderer/kind renderers (AC-COLLAPSE).
// RED phase — these fail until composeArtifactBody is created and kind layer removed.

// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import * as DesignSystem from "@hyperidle/design-system";
import { afterEach, describe, expect, it } from "vitest";

// This import will fail until composeArtifactBody is created
import { composeArtifactBody } from "../kinds/compose-artifact-body.js";

afterEach(cleanup);

describe("composeArtifactBody (Artifact composition)", () => {
	it("'code' kind → renders CodePayload (lang + text visible)", () => {
		const preview = { kind: "code", path: "src/hello.ts", lang: "typescript", text: "const x = 1;" };
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

	it("'html' kind → renders HtmlPayload (with sanitizeHtml injected)", () => {
		const preview = { kind: "html", html: "<p>Hello</p>" };
		// sanitizeHtml that passes content through
		const sanitizeHtml = (raw: string): string => raw;
		const { container } = render(<>{composeArtifactBody("html", preview, sanitizeHtml)}</>);
		// HtmlPayload renders via dangerouslySetInnerHTML
		expect(container.querySelector("p")).toBeTruthy();
	});

	it("'html' kind → renders UnknownPayload when sanitizeHtml is absent", () => {
		const preview = { kind: "html", html: "<p>Hello</p>" };
		const { container } = render(<>{composeArtifactBody("html", preview)}</>);
		// UnknownPayload uses a border-l warning stripe — data-block-unknown-pill is present
		expect(container.querySelector("[data-block-unknown-pill]")).toBeTruthy();
	});

	it("unknown kind → renders UnknownPayload (K1 fallback, never crashes)", () => {
		const preview = { kind: "mystery_kind", data: "something" };
		const { container } = render(<>{composeArtifactBody("mystery_kind", preview)}</>);
		expect(container.querySelector("[data-block-unknown-pill]")).toBeTruthy();
	});

	it("AC5: composeArtifactBody('mystery', …) → UnknownPayload, never throws", () => {
		// K1: unknown content → fallback, never crash
		expect(() => {
			render(<>{composeArtifactBody("mystery", { kind: "mystery" })}</>);
		}).not.toThrow();
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

describe("code.ts purified schema (K0/K4)", () => {
	it("codePreviewSchema accepts pure {path,lang,text} shape", async () => {
		const { codePreviewSchema } = await import("@hyperidle/shared");
		const result = codePreviewSchema.safeParse({
			kind: "code",
			path: "src/index.ts",
			lang: "typescript",
			text: "const x = 1;",
		});
		expect(result.success).toBe(true);
	});

	it("codePreviewSchema rejects old {file,hunks} shape (K0 violation removed)", async () => {
		const { codePreviewSchema } = await import("@hyperidle/shared");
		const result = codePreviewSchema.safeParse({
			kind: "code",
			file: "src/index.ts",
			hunks: [],
		});
		expect(result.success).toBe(false);
	});

	it("code.ts displayTitle returns path (not file)", async () => {
		const { codeKind } = await import("@hyperidle/shared");
		const preview = { kind: "code", path: "src/hello.ts", lang: "ts", text: "const x = 1;" };
		expect(codeKind.displayTitle(preview)).toBe("src/hello.ts");
	});
});
