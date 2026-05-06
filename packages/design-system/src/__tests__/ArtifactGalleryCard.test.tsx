// @vitest-environment jsdom
// L3 RED — Tier 2 layout: ArtifactGalleryCard.
// Protected: AC-9 — placeholder text "PREVIEW PENDING", no <img>.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArtifactGalleryCard } from "../ArtifactGalleryCard.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FIXTURE = {
	id: "art1",
	producingTaskId: "task1",
	producingTaskTitle: "Implement auth flow",
	kind: "drafted_email" as const,
	preview: {
		kind: "drafted_email" as const,
		to: ["a@b.co"],
		subject: "Welcome",
		bodyExcerpt: "Hi there",
	},
	cost: { money: { minor: 42, currency: "USD" as const }, tokens: null },
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

	it("renders the kind badge, producing task title, cost chip and timestamp", () => {
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
		expect(container.textContent).toContain("$0.42");
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

	// Protected — AC-9: placeholder, never fake thumbnail
	it("renders 'PREVIEW PENDING' when preview is null and shows no <img>", () => {
		act(() => {
			root.render(
				createElement(ArtifactGalleryCard, {
					data: { ...FIXTURE, preview: null },
					onOpen: () => undefined,
				}),
			);
		});
		expect(container.textContent).toContain("PREVIEW PENDING");
		expect(container.querySelector("img")).toBeNull();
	});

	it("renders an em-dash for cost when both money and tokens are null", () => {
		act(() => {
			root.render(
				createElement(ArtifactGalleryCard, {
					data: { ...FIXTURE, cost: { money: null, tokens: null } },
					onOpen: () => undefined,
				}),
			);
		});
		expect(container.textContent).toContain("—");
		expect(container.textContent).not.toContain("$0.00");
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
