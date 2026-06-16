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

describe("SF-3 — duplicate-component fallback disambiguation", () => {
	let dupRoot: HTMLDivElement;

	beforeEach(() => {
		// Three BYTE-IDENTICAL BetCards: same class, same inner markup AND same text,
		// so (component, element) descriptors are identical across all three instances.
		// A distinct data-test-id (NOT in classList/text → not in the descriptor) lets
		// the test assert which instance was resolved.
		dupRoot = document.createElement("div");
		const card = (id: string): string =>
			`<div data-ds-component="BetCard" class="card" data-test-id="${id}">
				<div class="head"><span class="title">Bet</span></div>
			</div>`;
		dupRoot.innerHTML = card("c0") + card("c1") + card("c2");
		document.body.appendChild(dupRoot);
	});

	afterEach(() => {
		dupRoot.remove();
	});

	test("descriptors are byte-identical across the three duplicate cards", () => {
		const titles = dupRoot.querySelectorAll<HTMLElement>(".title");
		const a0 = computeAnchor(titles[0] as HTMLElement, dupRoot);
		const a1 = computeAnchor(titles[1] as HTMLElement, dupRoot);
		const a2 = computeAnchor(titles[2] as HTMLElement, dupRoot);
		// (component, element) collide across all three — only the path distinguishes them.
		expect(a0.element).toBe(a1.element);
		expect(a1.element).toBe(a2.element);
		expect(a0.component).toBe(a2.component);
		expect(a0.path).not.toEqual(a1.path);
		expect(a1.path).not.toEqual(a2.path);
	});

	test("path is the PRIMARY key — re-finds the exact instance on unchanged DOM", () => {
		const titles = dupRoot.querySelectorAll<HTMLElement>(".title");
		for (const t of titles) {
			expect(resolveAnchor(computeAnchor(t, dupRoot), dupRoot)).toBe(t);
		}
	});

	test("after a sibling removal shifts the path, fallback lands on the CORRECT surviving instance (not the first)", () => {
		const titleC2 = dupRoot
			.querySelector('[data-test-id="c2"]')
			?.querySelector<HTMLElement>(".title");
		if (!titleC2) throw new Error("fixture");
		const anchor = computeAnchor(titleC2, dupRoot); // path = [2,0,0]
		// Remove the FIRST card → indices shift; the path walk now misses → fallback.
		dupRoot.querySelector('[data-test-id="c0"]')?.remove();
		const resolved = resolveAnchor(anchor, dupRoot);
		expect(resolved).toBe(titleC2);
		// The resolved title lives inside the c2 card, NOT the first surviving card (c1).
		expect(resolved?.closest("[data-test-id]")?.getAttribute("data-test-id")).toBe("c2");
	});

	test("single descriptor match still resolves via fallback when path shifts", () => {
		const titleC1 = dupRoot
			.querySelector('[data-test-id="c1"]')
			?.querySelector<HTMLElement>(".title");
		if (!titleC1) throw new Error("fixture");
		const anchor = computeAnchor(titleC1, dupRoot);
		// Remove c0 AND c2 → only one card remains; path [1,0,0] misses → single match.
		dupRoot.querySelector('[data-test-id="c0"]')?.remove();
		dupRoot.querySelector('[data-test-id="c2"]')?.remove();
		const resolved = resolveAnchor(anchor, dupRoot);
		expect(resolved).toBe(titleC1);
	});
});
