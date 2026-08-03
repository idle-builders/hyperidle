// @vitest-environment jsdom
// L3 RED — Tier 2 layout: ArtifactStackItem.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArtifactStackItem } from "../ArtifactStackItem.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// @lore AF2: Artifact.kind is open-vocabulary (string). ArtifactPreview is a
// closed discriminated union (6 AE6 kinds). Use null preview for retired kinds.
const FIXTURE = {
	id: "art1",
	producingTaskId: "task1",
	producingTaskTitle: "Implement auth flow",
	kind: "code_diff" as string,
	label: null,
	preview: null,
	threadCount: 0,
	createdAt: "2026-04-28T00:00:00.000Z",
};

describe("ArtifactStackItem", () => {
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

	it("renders kind, task title, and timestamp on a single row", () => {
		act(() => {
			root.render(
				createElement(ArtifactStackItem, {
					data: FIXTURE,
					onOpen: () => undefined,
				}),
			);
		});
		expect(container.textContent).toContain("CODE DIFF");
		expect(container.textContent).toContain("Implement auth flow");
	});

	it("does NOT render an internal preview surface (rows have no preview)", () => {
		act(() => {
			root.render(
				createElement(ArtifactStackItem, {
					data: FIXTURE,
					onOpen: () => undefined,
				}),
			);
		});
		// no PREVIEW PENDING / NOT YET RENDERED placeholders should ever render here
		expect(container.textContent).not.toContain("PREVIEW PENDING");
		expect(container.textContent).not.toContain("PREVIEW NOT YET RENDERED");
	});

	it("calls onOpen when the row is clicked", () => {
		const onOpen = vi.fn();
		act(() => {
			root.render(createElement(ArtifactStackItem, { data: FIXTURE, onOpen }));
		});
		(container.firstElementChild as HTMLElement).click();
		expect(onOpen).toHaveBeenCalledTimes(1);
	});

	it("renders '1 thread' when threadCount === 1", () => {
		act(() => {
			root.render(
				createElement(ArtifactStackItem, {
					data: { ...FIXTURE, threadCount: 1 },
					onOpen: () => undefined,
				}),
			);
		});
		// pluralization rule applies
		expect(container.textContent).toContain("1 thread");
	});

	it("hides the thread pill when threadCount = 0", () => {
		act(() => {
			root.render(
				createElement(ArtifactStackItem, {
					data: { ...FIXTURE, threadCount: 0 },
					onOpen: () => undefined,
				}),
			);
		});
		expect(container.textContent).not.toMatch(/0 thread/);
	});
});
