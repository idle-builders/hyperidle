// @vitest-environment jsdom
// L3 RED — sub-primitive ArtifactPreviewSurface (kind dispatcher).
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ArtifactPreviewSurface } from "../ArtifactPreviewSurface.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("ArtifactPreviewSurface", () => {
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

	it("renders 'PREVIEW PENDING' for size='gallery' when preview is null (placeholder; no <img>)", () => {
		act(() => {
			root.render(
				createElement(ArtifactPreviewSurface, {
					kind: "design",
					preview: null,
					size: "gallery",
				}),
			);
		});
		expect(container.textContent).toContain("PREVIEW PENDING");
		expect(container.querySelector("img")).toBeNull();
	});

	it("renders 'PREVIEW NOT YET RENDERED' for size='full' when preview is null", () => {
		act(() => {
			root.render(
				createElement(ArtifactPreviewSurface, {
					kind: "screenshot",
					preview: null,
					size: "full",
				}),
			);
		});
		expect(container.textContent).toContain("PREVIEW NOT YET RENDERED");
		expect(container.querySelector("img")).toBeNull();
	});

	it("AE6: renders PREVIEW PENDING for unregistered kind with null preview (open vocabulary)", () => {
		// @lore AE6: 'unknown_kind' is no longer special-cased.
		// Unregistered kinds with null preview show the generic placeholder.
		act(() => {
			root.render(
				createElement(ArtifactPreviewSurface, {
					kind: "unknown_kind",
					preview: null,
					size: "gallery",
				}),
			);
		});
		expect(container.textContent).toContain("PREVIEW PENDING");
	});

	it("AE6: renders 'kind: preview not available' for unregistered kind with unrecognised preview", () => {
		// @lore AE6: Old 'deck' kind is no longer registered. Its preview data is
		// not understood by any Kind Definition. The fallback message shows the kind name.
		act(() => {
			root.render(
				createElement(ArtifactPreviewSurface, {
					kind: "deck",
					preview: { kind: "deck", slideCount: 12, firstSlideTitle: "Intro" },
					size: "gallery",
				}),
			);
		});
		expect(container.textContent).toContain("deck");
		expect(container.textContent).toContain("preview not available");
	});

	it("AE6: renders summary for registered kind (html=deck mapped) with valid preview", () => {
		// @lore AE6: 'html' is the fundamental kind for old 'deck'. Test that html kind
		// with its own preview schema renders a summary via Kind Definition.
		act(() => {
			root.render(
				createElement(ArtifactPreviewSurface, {
					kind: "html",
					preview: {
						kind: "html",
						html: "<h1>Q3 Strategy Review</h1>",
						title: "Q3 Strategy Review",
					},
					size: "gallery",
				}),
			);
		});
		expect(container.textContent).toContain("Q3 Strategy Review");
	});
});
