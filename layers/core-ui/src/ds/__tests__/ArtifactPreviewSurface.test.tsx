// AF16 T10/T11 — ArtifactPreviewSurface updated tests.
// Replaces the old AE6 tests since component behavior changed: "PREVIEW PENDING"/"PREVIEW NOT YET RENDERED"
// replaced with honest "No preview available"/"No preview" (AF16 T11).
// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ArtifactPreviewSurface } from "../ArtifactPreviewSurface.js";

// @lore AZ6: full-size previews require the app's HTML sanitiser at the type level.
const passthrough = (raw: string): string => raw;

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

	// T11: null preview → honest affordance (not old aspirational copy)
	it("renders 'No preview' for size='gallery' when preview is null (AF16 T11)", () => {
		act(() => {
			root.render(
				createElement(ArtifactPreviewSurface, {
					kind: "image",
					preview: null,
					size: "gallery",
				}),
			);
		});
		expect(container.textContent).toContain("No preview");
		expect(container.textContent).not.toContain("PREVIEW PENDING");
		expect(container.querySelector("img")).toBeNull();
	});

	it("renders 'No preview available' for size='full' when preview is null (AF16 T11)", () => {
		act(() => {
			root.render(
				createElement(ArtifactPreviewSurface, {
					kind: "screenshot",
					preview: null,
					size: "full",
					sanitizeHtml: passthrough,
				}),
			);
		});
		expect(container.textContent).toContain("No preview available");
		expect(container.textContent).not.toContain("PREVIEW NOT YET RENDERED");
		expect(container.querySelector("img")).toBeNull();
	});

	it("AE6: unregistered kind with null preview shows 'No preview' (gallery)", () => {
		act(() => {
			root.render(
				createElement(ArtifactPreviewSurface, {
					kind: "unknown_kind",
					preview: null,
					size: "gallery",
				}),
			);
		});
		expect(container.textContent).toContain("No preview");
	});

	it("AE6/AZ6: names the unregistered kind in the gallery caption", () => {
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
		expect(container.textContent).toContain("no preview");
	});

	it("AE6: renders summary for html kind with valid preview (gallery)", () => {
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

	// T10: full size dispatches through registry → image renders <img>
	it("T10: full+image+preview → renders <img> with src (not dimension text)", () => {
		act(() => {
			root.render(
				createElement(ArtifactPreviewSurface, {
					kind: "image",
					size: "full",
					sanitizeHtml: passthrough,
					preview: { url: "https://example.com/img.png", width: 400, height: 300 },
				}),
			);
		});
		const img = container.querySelector("img");
		expect(img).not.toBeNull();
		expect(img?.getAttribute("src")).toBe("https://example.com/img.png");
	});
});
