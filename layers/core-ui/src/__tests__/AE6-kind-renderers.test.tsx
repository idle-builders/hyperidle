// AM5 — REWRITTEN from kind-renderer dispatch to composeArtifactBody dispatch.
//
// This test was originally `AE6-kind-renderers.test.tsx` which asserted that
// CodeRenderer/TextRenderer/etc dispatched for each kind via getRenderer().
//
// K5: the kind-renderer layer is DELETED. getRenderer / CodeRenderer / TextRenderer
// / DataRenderer / HtmlRenderer / ImageRenderer / UrlRenderer / FallbackRenderer
// / RendererComponent / RendererProps are ALL removed from the barrel.
//
// This file now proves:
// 1. composeArtifactBody dispatches to the right base primitive per kind (AC1/AC4).
// 2. The barrel no longer exports getRenderer / *Renderer (AC-COLLAPSE negative-existence).
// 3. The gate (ArtifactPreviewSurface) returns NoPreviewText for null preview (K0b).

import * as DesignSystem from "@hyperidle/design-system";
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(cleanup);

// ── composeArtifactBody dispatch ──────────────────────────────────────────────

const { composeArtifactBody, ArtifactPreviewSurface } = DesignSystem;

describe("composeArtifactBody dispatch (AC1/AC4)", () => {
	it("'code' kind → renders CodePayload (pre block with code text)", () => {
		const preview = {
			kind: "code",
			path: "src/hello.ts",
			lang: "typescript",
			text: "const x = 1;",
		};
		const { container } = render(<>{composeArtifactBody("code", preview)}</>);
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

	it("'url' kind → renders an anchor link to the url", () => {
		const preview = { kind: "url", url: "https://example.com/service" };
		const { container } = render(<>{composeArtifactBody("url", preview)}</>);
		const link = container.querySelector("a");
		expect(link).toBeTruthy();
		expect(link?.getAttribute("href")).toBe("https://example.com/service");
	});

	// AZ6: the html kind runs whole in a sealed frame rather than being sanitised
	// into the app's document — see framework/design-system/src/artifact-frame/.
	it("'html' kind → renders inside a sealed frame carrying the artifact's markup", () => {
		const preview = { kind: "html", html: "<p>Hello dashboard</p>" };
		const { container } = render(<>{composeArtifactBody("html", preview)}</>);
		const frame = container.querySelector("iframe");
		expect(frame?.getAttribute("sandbox")).toBe("allow-scripts");
		expect(frame?.getAttribute("srcdoc") ?? "").toContain("Hello dashboard");
	});

	it("unknown kind → the designed unrenderable state (K1 fallback, never crashes)", () => {
		const preview = { kind: "mystery_kind", data: "something" };
		const { container } = render(<>{composeArtifactBody("mystery_kind", preview)}</>);
		expect(container.querySelector("[data-artifact-unrenderable]")).toBeTruthy();
	});
});

// ── AC-COLLAPSE: negative existence of getRenderer / *Renderer (K5) ──────────

describe("AC-COLLAPSE: kind-renderer barrel removal (K5)", () => {
	it("barrel does NOT export getRenderer", () => {
		// @ts-expect-error K5: getRenderer is removed from the barrel
		expect(DesignSystem.getRenderer).toBeUndefined();
	});

	it("barrel does NOT export CodeRenderer", () => {
		// @ts-expect-error K5: CodeRenderer is removed from the barrel
		expect(DesignSystem.CodeRenderer).toBeUndefined();
	});

	it("barrel does NOT export TextRenderer", () => {
		// @ts-expect-error K5: TextRenderer is removed from the barrel
		expect(DesignSystem.TextRenderer).toBeUndefined();
	});

	it("barrel does NOT export DataRenderer", () => {
		// @ts-expect-error K5: DataRenderer is removed from the barrel
		expect(DesignSystem.DataRenderer).toBeUndefined();
	});

	it("barrel does NOT export HtmlRenderer", () => {
		// @ts-expect-error K5: HtmlRenderer is removed from the barrel
		expect(DesignSystem.HtmlRenderer).toBeUndefined();
	});

	it("barrel does NOT export ImageRenderer", () => {
		// @ts-expect-error K5: ImageRenderer is removed from the barrel
		expect(DesignSystem.ImageRenderer).toBeUndefined();
	});

	it("barrel does NOT export UrlRenderer", () => {
		// @ts-expect-error K5: UrlRenderer is removed from the barrel
		expect(DesignSystem.UrlRenderer).toBeUndefined();
	});

	it("barrel does NOT export FallbackRenderer", () => {
		// @ts-expect-error K5: FallbackRenderer is removed from the barrel
		expect(DesignSystem.FallbackRenderer).toBeUndefined();
	});

	it("barrel DOES export composeArtifactBody (the replacement)", () => {
		expect(composeArtifactBody).toBeDefined();
		expect(typeof composeArtifactBody).toBe("function");
	});
});

// ── K0b gate: ArtifactPreviewSurface handles null preview ────────────────────

describe("ArtifactPreviewSurface gate (K0b)", () => {
	it("preview=null renders 'No preview available' (not a primitive empty-state)", () => {
		render(
			<ArtifactPreviewSurface kind="code" preview={null} size="full" sanitizeHtml={(raw) => raw} />,
		);
		expect(screen.getByText("No preview available")).toBeTruthy();
	});

	it("preview=null gallery size renders 'No preview'", () => {
		render(<ArtifactPreviewSurface kind="code" preview={null} size="gallery" />);
		expect(screen.getByText("No preview")).toBeTruthy();
	});
});
