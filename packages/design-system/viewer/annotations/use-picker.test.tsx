// @vitest-environment jsdom

/**
 * AJ7 — use-picker.test.tsx (TDD red)
 *
 * AC1/AC3/AC5/AC7/AC8: the picker engine over a live storyRoot.
 *   - arm attaches a one-shot capturing click listener; click selects + detaches.
 *   - selection stores the HTMLElement (no frozen rect); computes target + anchor.
 *   - crumbs are deduped + distinct on a same-component nested chain.
 *   - beginReHighlight of an absent-anchor annotation → reHighlightMissing.
 *   - beginReHighlight of a not-in-DOM anchor → reHighlightMissing (never throws).
 */

import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { Annotation } from "./types.js";
import { type Picker, usePicker } from "./use-picker.js";

// biome-ignore lint/style/useNamingConvention: React's flag name is fixed.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let storyRoot: HTMLDivElement;

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);

	storyRoot = document.createElement("div");
	// Nested same-component chain: BetCard > BetCard-head > span.title
	storyRoot.innerHTML = `
		<div data-ds-component="BetCard" class="card">
			<div data-ds-component="BetCard" class="head">
				<span data-ds-component="BetCard" class="title">Alpha</span>
			</div>
		</div>
	`;
	document.body.appendChild(storyRoot);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
	storyRoot.remove();
});

/** Mount the hook, exposing its latest value via a captured ref. */
function mountPicker(): { current: Picker } {
	const handle: { current: Picker } = { current: null as unknown as Picker };
	function Probe(): null {
		const p = usePicker(storyRoot);
		useEffect(() => {
			handle.current = p;
		});
		handle.current = p;
		return null;
	}
	act(() => {
		root.render(createElement(Probe));
	});
	return handle;
}

describe("AC1/AC8 — arm + one-shot select", () => {
	test("arm sets armed=true", () => {
		const p = mountPicker();
		act(() => p.current.arm());
		expect(p.current.armed).toBe(true);
	});

	test("clicking a story element selects it and disarms", () => {
		const p = mountPicker();
		const span = storyRoot.querySelector<HTMLElement>(".title");
		if (!span) throw new Error("fixture");
		act(() => p.current.arm());
		act(() => {
			span.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
		});
		expect(p.current.selected?.el).toBe(span);
		expect(p.current.armed).toBe(false);
	});

	test("a second click after select does NOT re-select (one-shot detach)", () => {
		const p = mountPicker();
		const span = storyRoot.querySelector<HTMLElement>(".title");
		const head = storyRoot.querySelector<HTMLElement>(".head");
		if (!(span && head)) throw new Error("fixture");
		act(() => p.current.arm());
		act(() => span.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
		const first = p.current.selected?.el;
		act(() => head.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
		expect(p.current.selected?.el).toBe(first);
	});
});

describe("AC3 — selection stores element + anchor, no frozen rect", () => {
	test("selected target carries a computed anchor", () => {
		const p = mountPicker();
		const span = storyRoot.querySelector<HTMLElement>(".title");
		if (!span) throw new Error("fixture");
		act(() => p.current.arm());
		act(() => span.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
		expect(p.current.selected?.target.anchor).toBeDefined();
		expect(Array.isArray(p.current.selected?.target.anchor?.path)).toBe(true);
	});
});

describe("AC8 — breadcrumb dedupe", () => {
	test("consecutive same-component crumbs do not render identical labels", () => {
		const p = mountPicker();
		const span = storyRoot.querySelector<HTMLElement>(".title");
		if (!span) throw new Error("fixture");
		act(() => p.current.arm());
		act(() => span.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
		const labels = p.current.crumbs.map((c) => c.label);
		// No two consecutive labels are byte-identical (would be "BetCard › BetCard › BetCard")
		for (let i = 1; i < labels.length; i++) {
			expect(labels[i]).not.toBe(labels[i - 1]);
		}
		expect(p.current.crumbs.length).toBeGreaterThan(0);
	});

	test("exactly one crumb is flagged current (=== selected.el)", () => {
		const p = mountPicker();
		const span = storyRoot.querySelector<HTMLElement>(".title");
		if (!span) throw new Error("fixture");
		act(() => p.current.arm());
		act(() => span.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
		const current = p.current.crumbs.filter((c) => c.isCurrent);
		expect(current).toHaveLength(1);
		expect(current[0]?.el).toBe(span);
	});

	test("selectCrumb re-points selection to that ancestor", () => {
		const p = mountPicker();
		const span = storyRoot.querySelector<HTMLElement>(".title");
		const card = storyRoot.querySelector<HTMLElement>(".card");
		if (!(span && card)) throw new Error("fixture");
		act(() => p.current.arm());
		act(() => span.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
		act(() => p.current.selectCrumb(card));
		expect(p.current.selected?.el).toBe(card);
	});
});

describe("AC7 — re-highlight missing states", () => {
	function annotationWithAnchor(path: number[]): Annotation {
		return {
			id: "a1",
			createdAt: "2026-06-16T00:00:00.000Z",
			story: "S",
			variant: "V",
			note: "n",
			target: {
				component: "BetCard",
				dsComponent: "BetCard",
				element: 'span.title "Alpha"',
				anchor: { path, component: "BetCard", element: 'span.title "Alpha"' },
			},
		};
	}

	test("absent-anchor annotation → reHighlightMissing", () => {
		const p = mountPicker();
		const a: Annotation = {
			id: "a0",
			createdAt: "2026-06-16T00:00:00.000Z",
			story: "S",
			variant: "V",
			note: "n",
			target: { component: "C", dsComponent: null, element: "span" },
		};
		act(() => p.current.beginReHighlight(a));
		expect(p.current.reHighlightMissing).toBe(true);
		expect(p.current.reHighlightEl).toBeNull();
	});

	test("resolvable anchor → reHighlightEl set, not missing", () => {
		const p = mountPicker();
		const span = storyRoot.querySelector<HTMLElement>(".title");
		act(() => p.current.beginReHighlight(annotationWithAnchor([0, 0, 0])));
		expect(p.current.reHighlightEl).toBe(span);
		expect(p.current.reHighlightMissing).toBe(false);
	});

	test("not-in-DOM anchor (path + descriptor both miss) → reHighlightMissing, never throws", () => {
		const p = mountPicker();
		// Path miss AND a descriptor that matches no element in the fixture.
		const a: Annotation = {
			id: "gone",
			createdAt: "2026-06-16T00:00:00.000Z",
			story: "S",
			variant: "V",
			note: "n",
			target: {
				component: "GhostComponent",
				dsComponent: null,
				element: 'div.gone "removed"',
				anchor: { path: [9, 9, 9], component: "GhostComponent", element: 'div.gone "removed"' },
			},
		};
		expect(() => {
			act(() => p.current.beginReHighlight(a));
		}).not.toThrow();
		expect(p.current.reHighlightMissing).toBe(true);
	});

	test("endReHighlight clears state", () => {
		const p = mountPicker();
		act(() => p.current.beginReHighlight(annotationWithAnchor([0, 0, 0])));
		act(() => p.current.endReHighlight());
		expect(p.current.reHighlightEl).toBeNull();
		expect(p.current.reHighlightMissing).toBe(false);
	});
});
