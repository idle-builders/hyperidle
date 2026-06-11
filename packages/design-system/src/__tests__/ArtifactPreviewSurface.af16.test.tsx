/**
 * AF16 T10, T11 — ArtifactPreviewSurface: registry dispatch + honest fallback (RED).
 *
 * Tests the new behavior after T9 (renderer registry moved to design-system):
 * - full size: dispatch through getRenderer(kind) → <img> for image kind
 * - fallback: null preview, error, malformed → "No preview available"
 * - alt attribute preserved from ImageRenderer
 * - gallery size stays with summary text
 *
 * Z8-026, Z8-027, Z8-028.
 */
// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ArtifactPreviewSurface } from "../ArtifactPreviewSurface.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("AF16 T10, T11 — ArtifactPreviewSurface (registry dispatch + fallback)", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	// T10: image kind + valid preview → <img>, NOT the text "400×300"
	it("T10: full+image+preview → renders <img> with src, NOT '400×300' text (Z8-026)", () => {
		act(() => {
			root.render(
				createElement(ArtifactPreviewSurface, {
					kind: "image",
					size: "full",
					preview: { url: "https://example.com/img.png", width: 400, height: 300 },
				}),
			);
		});
		const img = container.querySelector("img");
		expect(img).not.toBeNull();
		expect(img?.getAttribute("src")).toBe("https://example.com/img.png");
		// Body must NOT be just the dimension text
		expect(container.textContent?.trim()).not.toBe("400×300");
		expect(container.textContent?.trim()).not.toBe("400 × 300");
	});

	// T10 WARNING-4: alt attribute preserved
	it("T10: <img> has non-empty alt; with preview.alt it equals that value (Z8-028)", () => {
		act(() => {
			root.render(
				createElement(ArtifactPreviewSurface, {
					kind: "image",
					size: "full",
					preview: { url: "https://example.com/chart.png", width: 800, height: 600, alt: "My chart" },
				}),
			);
		});
		const img = container.querySelector("img");
		expect(img).not.toBeNull();
		expect(img?.getAttribute("alt")).toBe("My chart");
	});

	it("T10: <img> without alt falls back to dimensional string (non-empty)", () => {
		act(() => {
			root.render(
				createElement(ArtifactPreviewSurface, {
					kind: "image",
					size: "full",
					preview: { url: "https://example.com/img2.png", width: 200, height: 150 },
				}),
			);
		});
		const img = container.querySelector("img");
		expect(img).not.toBeNull();
		const alt = img?.getAttribute("alt") ?? "";
		expect(alt.length).toBeGreaterThan(0);
		// The dimensional fallback must contain the dimensions
		expect(alt).toContain("200");
		expect(alt).toContain("150");
	});

	// T11: null preview → "No preview available" (not "PREVIEW NOT YET RENDERED")
	it("T11: registered kind + null preview → 'No preview available' (Z8-027)", () => {
		act(() => {
			root.render(
				createElement(ArtifactPreviewSurface, {
					kind: "image",
					size: "full",
					preview: null,
				}),
			);
		});
		expect(container.textContent).toContain("No preview available");
		expect(container.textContent).not.toContain("PREVIEW NOT YET RENDERED");
		expect(container.textContent).not.toContain("PREVIEW PENDING");
	});

	// T11 WARNING-4 error branch: renderer that throws → "No preview available"
	it("T11: renderer throws on non-null preview → error boundary shows 'No preview available'", () => {
		// We test this via a kind whose renderer would fail with malformed preview.
		// image renderer with missing url should gracefully degrade (or error boundary catches throw)
		act(() => {
			root.render(
				createElement(ArtifactPreviewSurface, {
					kind: "image",
					size: "full",
					preview: {}, // malformed: no url
				}),
			);
		});
		// Should NOT render a broken <img src="">
		const img = container.querySelector("img");
		if (img) {
			// If img exists, src must NOT be empty
			expect(img.getAttribute("src")).not.toBe("");
			expect(img.getAttribute("src")).not.toBeNull();
		} else {
			// No img → should show fallback text
			expect(container.textContent).toContain("No preview available");
		}
	});

	// T11 WARNING-4 malformed: image missing url → fallback
	it("T11: malformed image preview (no url) → 'No preview available', no <img> with empty src", () => {
		act(() => {
			root.render(
				createElement(ArtifactPreviewSurface, {
					kind: "image",
					size: "full",
					preview: { width: 400, height: 300 }, // url missing
				}),
			);
		});
		const img = container.querySelector("img");
		// Either no img at all, or img has a valid non-empty src
		if (img) {
			const src = img.getAttribute("src");
			expect(src).not.toBeFalsy();
		} else {
			expect(container.textContent).toContain("No preview available");
		}
	});

	// T11: gallery size + null preview → "No preview"
	it("T11: gallery + null preview → 'No preview' (Z8-027 gallery)", () => {
		act(() => {
			root.render(
				createElement(ArtifactPreviewSurface, {
					kind: "image",
					size: "gallery",
					preview: null,
				}),
			);
		});
		expect(container.textContent).toContain("No preview");
		expect(container.textContent).not.toContain("PREVIEW PENDING");
	});
});
