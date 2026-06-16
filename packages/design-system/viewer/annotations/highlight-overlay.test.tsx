// @vitest-environment jsdom

/**
 * AJ7 — highlight-overlay.test.tsx (TDD red)
 *
 * AC3: HighlightLayer is driven by useElementRect (live), not a frozen rect.
 *      Renders box+label when el set; renders nothing when el === null;
 *      the box inline style follows the element's measured rect.
 * AC4 (partial): the layer never mutates the inspected element's classList.
 */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { HighlightLayer } from "./highlight-overlay.js";

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
});

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

describe("AC3 — HighlightLayer", () => {
	test("renders nothing when el is null", async () => {
		await act(async () => {
			root.render(createElement(HighlightLayer, { el: null, label: "x", tone: "hover" }));
		});
		expect(container.querySelector(".anno-hl-box")).toBeNull();
	});

	test("renders a box + label when el is provided", async () => {
		const el = document.createElement("div");
		stubRect(el, { top: 10, left: 20, width: 30, height: 40 });
		document.body.appendChild(el);
		await act(async () => {
			root.render(createElement(HighlightLayer, { el, label: "Button · btn", tone: "hover" }));
		});
		const box = container.querySelector(".anno-hl-box") as HTMLElement | null;
		const label = container.querySelector(".anno-hl-label");
		expect(box).not.toBeNull();
		expect(label?.textContent).toBe("Button · btn");
		expect(box?.style.top).toBe("10px");
		expect(box?.style.left).toBe("20px");
		expect(box?.style.width).toBe("30px");
		el.remove();
	});

	test("box carries data-tone", async () => {
		const el = document.createElement("div");
		stubRect(el, { top: 0, left: 0, width: 5, height: 5 });
		document.body.appendChild(el);
		await act(async () => {
			root.render(createElement(HighlightLayer, { el, label: "x", tone: "selected" }));
		});
		expect(container.querySelector(".anno-hl-box")?.getAttribute("data-tone")).toBe("selected");
		el.remove();
	});

	test("does not add classes to the inspected element (AC4)", async () => {
		const el = document.createElement("div");
		el.className = "original-class";
		stubRect(el, { top: 0, left: 0, width: 5, height: 5 });
		document.body.appendChild(el);
		await act(async () => {
			root.render(createElement(HighlightLayer, { el, label: "x", tone: "hover" }));
		});
		expect(el.className).toBe("original-class");
		el.remove();
	});
});
