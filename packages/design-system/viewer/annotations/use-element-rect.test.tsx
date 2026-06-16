// @vitest-environment jsdom

/**
 * AJ7 — use-element-rect.test.tsx (TDD red)
 *
 * AC2: useElementRect re-measures on window `scroll` (capture) + `resize`;
 *      returns null for null el; removes listeners on unmount.
 * AC3 (partial): the live rect is driven by getBoundingClientRect, never frozen.
 */

import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { isRectOffscreen, measureRect, useElementRect } from "./use-element-rect.js";

// biome-ignore lint/style/useNamingConvention: React's flag name is fixed.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
	vi.restoreAllMocks();
});

/** Stub getBoundingClientRect on an element to return a controllable rect. */
function stubRect(
	el: HTMLElement,
	r: { top: number; left: number; width: number; height: number },
): void {
	el.getBoundingClientRect = (): DOMRect =>
		({
			top: r.top,
			left: r.left,
			width: r.width,
			height: r.height,
			right: r.left + r.width,
			bottom: r.top + r.height,
			x: r.left,
			y: r.top,
			toJSON: () => ({}),
		}) as DOMRect;
}

describe("AC2 — measureRect", () => {
	test("maps getBoundingClientRect to a plain Rect", () => {
		const el = document.createElement("div");
		stubRect(el, { top: 10, left: 20, width: 30, height: 40 });
		expect(measureRect(el)).toEqual({ top: 10, left: 20, width: 30, height: 40 });
	});
});

describe("AC7 — isRectOffscreen", () => {
	test("rect inside viewport is on-screen", () => {
		expect(isRectOffscreen({ top: 10, left: 10, width: 50, height: 50 }, 800, 600)).toBe(false);
	});
	test("rect below the viewport is off-screen", () => {
		expect(isRectOffscreen({ top: 700, left: 10, width: 50, height: 50 }, 800, 600)).toBe(true);
	});
	test("rect above the viewport (negative top) is off-screen", () => {
		expect(isRectOffscreen({ top: -100, left: 10, width: 50, height: 50 }, 800, 600)).toBe(true);
	});
});

describe("AC2 — useElementRect hook", () => {
	function Probe({
		el,
		onRect,
	}: {
		el: HTMLElement | null;
		onRect: (r: ReturnType<typeof useElementRect>) => void;
	}): null {
		const rect = useElementRect(el);
		useEffect(() => {
			onRect(rect);
		}, [rect, onRect]);
		return null;
	}

	test("returns null when el is null", async () => {
		let latest: unknown = "unset";
		await act(async () => {
			root.render(createElement(Probe, { el: null, onRect: (r) => (latest = r) }));
		});
		expect(latest).toBeNull();
	});

	test("measures immediately on mount", async () => {
		const el = document.createElement("div");
		stubRect(el, { top: 5, left: 6, width: 7, height: 8 });
		let latest: unknown = null;
		await act(async () => {
			root.render(createElement(Probe, { el, onRect: (r) => (latest = r) }));
		});
		expect(latest).toEqual({ top: 5, left: 6, width: 7, height: 8 });
	});

	test("re-measures on window scroll (capture phase)", async () => {
		const el = document.createElement("div");
		stubRect(el, { top: 100, left: 0, width: 10, height: 10 });
		let latest: { top: number } | null = null;
		await act(async () => {
			root.render(createElement(Probe, { el, onRect: (r) => (latest = r) }));
		});
		expect(latest?.top).toBe(100);

		// Element "moved" because of scroll
		stubRect(el, { top: 40, left: 0, width: 10, height: 10 });
		await act(async () => {
			window.dispatchEvent(new Event("scroll"));
			// flush rAF
			await new Promise((res) => requestAnimationFrame(() => res(null)));
		});
		expect(latest?.top).toBe(40);
	});

	test("re-measures on window resize", async () => {
		const el = document.createElement("div");
		stubRect(el, { top: 100, left: 0, width: 10, height: 10 });
		let latest: { left: number } | null = null;
		await act(async () => {
			root.render(createElement(Probe, { el, onRect: (r) => (latest = r) }));
		});
		stubRect(el, { top: 100, left: 55, width: 10, height: 10 });
		await act(async () => {
			window.dispatchEvent(new Event("resize"));
			await new Promise((res) => requestAnimationFrame(() => res(null)));
		});
		expect(latest?.left).toBe(55);
	});

	test("removes scroll + resize listeners on unmount", async () => {
		const el = document.createElement("div");
		stubRect(el, { top: 0, left: 0, width: 1, height: 1 });
		const removeSpy = vi.spyOn(window, "removeEventListener");
		await act(async () => {
			root.render(createElement(Probe, { el, onRect: () => undefined }));
		});
		await act(async () => {
			root.unmount();
		});
		const removed = removeSpy.mock.calls.map((c) => c[0]);
		expect(removed).toContain("scroll");
		expect(removed).toContain("resize");
		// re-create root so afterEach unmount is safe
		root = createRoot(container);
	});
});
