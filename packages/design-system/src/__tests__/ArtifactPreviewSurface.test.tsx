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

	it("renders the catch-all message for unknown_kind (12-kind exhaustive switch fallthrough)", () => {
		act(() => {
			root.render(
				createElement(ArtifactPreviewSurface, {
					kind: "unknown_kind",
					preview: null,
					size: "gallery",
				}),
			);
		});
		expect(container.textContent).toContain("no preview renderer for this kind");
	});

	it("renders the deck variant with slide count when preview is populated", () => {
		act(() => {
			root.render(
				createElement(ArtifactPreviewSurface, {
					kind: "deck",
					preview: { kind: "deck", slideCount: 12, firstSlideTitle: "Intro" },
					size: "gallery",
				}),
			);
		});
		expect(container.textContent).toContain("12");
		expect(container.textContent).toContain("Intro");
	});
});
