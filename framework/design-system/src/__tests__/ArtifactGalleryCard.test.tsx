// @vitest-environment jsdom
// L3 RED — Tier 2 layout: ArtifactGalleryCard.
// Protected: AC-9 — placeholder text "PREVIEW PENDING", no <img>.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArtifactGalleryCard } from "../ArtifactGalleryCard.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// @lore AF2: Artifact.kind is open-vocabulary (string). The preview discriminated
// union only covers the 6 AE6 kinds. Use string cast for open kind + null preview.
const FIXTURE = {
	id: "art1",
	producingTaskId: "task1",
	producingTaskTitle: "Implement auth flow",
	kind: "drafted_email" as string,
	label: null,
	preview: null,
	threadCount: 0,
	createdAt: "2026-04-28T00:00:00.000Z",
};

describe("ArtifactGalleryCard", () => {
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

	it("renders the kind badge, producing task title, and timestamp", () => {
		act(() => {
			root.render(
				createElement(ArtifactGalleryCard, {
					data: FIXTURE,
					onOpen: () => undefined,
				}),
			);
		});
		expect(container.textContent).toContain("DRAFTED EMAIL");
		expect(container.textContent).toContain("Implement auth flow");
	});

	it("calls onOpen when clicked", () => {
		const onOpen = vi.fn();
		act(() => {
			root.render(createElement(ArtifactGalleryCard, { data: FIXTURE, onOpen }));
		});
		const rootEl = container.firstElementChild as HTMLElement;
		expect(rootEl).toBeTruthy();
		act(() => {
			rootEl.click();
		});
		expect(onOpen).toHaveBeenCalledTimes(1);
	});

	it("hides the thread pill when threadCount is 0 (earned, not given)", () => {
		act(() => {
			root.render(
				createElement(ArtifactGalleryCard, {
					data: { ...FIXTURE, threadCount: 0 },
					onOpen: () => undefined,
				}),
			);
		});
		expect(container.textContent).not.toMatch(/0 thread/);
	});

	it("renders '1 thread' when threadCount === 1", () => {
		act(() => {
			root.render(
				createElement(ArtifactGalleryCard, {
					data: { ...FIXTURE, threadCount: 1 },
					onOpen: () => undefined,
				}),
			);
		});
		expect(container.textContent).toContain("1 thread");
		expect(container.textContent).not.toContain("1 threads");
	});

	it("renders 'N threads' for N >= 2", () => {
		act(() => {
			root.render(
				createElement(ArtifactGalleryCard, {
					data: { ...FIXTURE, threadCount: 5 },
					onOpen: () => undefined,
				}),
			);
		});
		expect(container.textContent).toContain("5 threads");
	});

	// Protected — AC-9: honest placeholder, never fake thumbnail.
	// @lore AF16 T9: "PREVIEW PENDING" replaced with "No preview" (gallery size).
	it("renders 'No preview' when preview is null and shows no <img>", () => {
		act(() => {
			root.render(
				createElement(ArtifactGalleryCard, {
					data: { ...FIXTURE, preview: null },
					onOpen: () => undefined,
				}),
			);
		});
		expect(container.textContent).toContain("No preview");
		expect(container.querySelector("img")).toBeNull();
	});

	it("supports a 'loading' state without throwing", () => {
		act(() => {
			root.render(
				createElement(ArtifactGalleryCard, {
					data: FIXTURE,
					state: "loading",
					onOpen: () => undefined,
				}),
			);
		});
		expect(container.firstElementChild).toBeTruthy();
	});

	it("supports an 'error' state without throwing", () => {
		act(() => {
			root.render(
				createElement(ArtifactGalleryCard, {
					data: FIXTURE,
					state: "error",
					onOpen: () => undefined,
				}),
			);
		});
		expect(container.firstElementChild).toBeTruthy();
	});
});
