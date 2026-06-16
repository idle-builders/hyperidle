// @vitest-environment jsdom

/**
 * AJ7 — resolve-anchor.test.tsx (TDD red)
 *
 * AC5: computeAnchor→resolveAnchor round-trips to the same element on an
 *      unchanged DOM; a path-shift falls back to component+element match;
 *      an unresolvable anchor → null.
 */

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { computeAnchor, resolveAnchor } from "./resolve-anchor.js";

let root: HTMLDivElement;

beforeEach(() => {
	root = document.createElement("div");
	root.innerHTML = `
		<div data-ds-component="BetCard" class="card">
			<div class="head"><span class="title">Alpha</span></div>
		</div>
		<div data-ds-component="BetCard" class="card">
			<div class="head"><span class="title">Beta</span></div>
		</div>
	`;
	document.body.appendChild(root);
});

afterEach(() => {
	root.remove();
});

describe("AC5 — computeAnchor", () => {
	test("path is the child-index chain from root to el", () => {
		const span = root.querySelectorAll<HTMLElement>(".title")[1];
		if (!span) throw new Error("fixture");
		const anchor = computeAnchor(span, root);
		// root.children[1] (2nd card) → .head (index 0) → .title (index 0)
		expect(anchor.path).toEqual([1, 0, 0]);
		expect(typeof anchor.component).toBe("string");
		expect(anchor.element).toContain("span");
	});
});

describe("AC5 — resolveAnchor round-trip", () => {
	test("re-finds the same element on an unchanged DOM", () => {
		const span = root.querySelectorAll<HTMLElement>(".title")[1];
		if (!span) throw new Error("fixture");
		const anchor = computeAnchor(span, root);
		expect(resolveAnchor(anchor, root)).toBe(span);
	});

	test("distinguishes betcards[0] from betcards[1] via path", () => {
		const span0 = root.querySelectorAll<HTMLElement>(".title")[0];
		const span1 = root.querySelectorAll<HTMLElement>(".title")[1];
		if (!span0 || !span1) throw new Error("fixture");
		expect(resolveAnchor(computeAnchor(span0, root), root)).toBe(span0);
		expect(resolveAnchor(computeAnchor(span1, root), root)).toBe(span1);
	});

	test("falls back to component+element match when the path shifts", () => {
		const span1 = root.querySelectorAll<HTMLElement>(".title")[1];
		if (!span1) throw new Error("fixture");
		const anchor = computeAnchor(span1, root);
		// Remove the FIRST card → indices shift: the surviving card is now child[0].
		root.children[0]?.remove();
		const resolved = resolveAnchor(anchor, root);
		// The surviving title (was Beta) matches component+element descriptor.
		expect(resolved).not.toBeNull();
		expect(resolved?.textContent).toBe("Beta");
	});

	test("unresolvable anchor returns null", () => {
		const span = root.querySelectorAll<HTMLElement>(".title")[1];
		if (!span) throw new Error("fixture");
		const anchor = computeAnchor(span, root);
		root.innerHTML = "<p class='nothing'>different content</p>";
		expect(resolveAnchor(anchor, root)).toBeNull();
	});
});
