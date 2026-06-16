// @vitest-environment jsdom

/**
 * AJ5 — resolve-component.test.tsx
 *
 * TDD RED phase — imports modules that do not yet exist.
 * Expected failure: Cannot find module './resolve-component.js'
 *
 * AC1:  resolveComponentTarget returns nearest component displayName/name for an element
 *       WITHOUT data-ds-component (inner/plain node).
 * AC1b: resolution chain:
 *       - no-fiber-key node with [data-ds-component] ancestor → .component === dsComponent value
 *       - node with NEITHER fiber key NOR data-ds-component → .component === "unknown"
 * AC2:  target.dsComponent populated from nearest [data-ds-component] when present, null otherwise.
 * AC3:  target.element is a terse tag+class/text descriptor of the clicked node.
 *
 * @lore AJ5: React fiber keys are accessed via __reactFiber$* prefix scanning.
 * This is a React internal; version-coupled to React 19. In tests we render real
 * React components in jsdom — the fiber keys ARE present on rendered DOM nodes,
 * so fiber resolution tests work without mocking.
 *
 * @lore AJ5: For the "no fiber key" branches (AC1b), we create bare DOM nodes
 * without React rendering. Those nodes lack __reactFiber$* keys → the resolver
 * must fall through to [data-ds-component] or "unknown".
 */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { Button } from "../../src/Button.js";
import { resolveComponentTarget } from "./resolve-component.js";

// biome-ignore lint/style/useNamingConvention: React's flag name is fixed.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ---------------------------------------------------------------------------
// Test harness helpers
// ---------------------------------------------------------------------------

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	root.unmount();
	container.remove();
});

// ---------------------------------------------------------------------------
// AC1 — fiber resolution: inner element without data-ds-component
// ---------------------------------------------------------------------------

describe("AC1 — fiber resolution for inner elements", () => {
	test("resolves nearest component name via fiber for a rendered Button's inner span or text node", async () => {
		// Render a Button — it stamps data-ds-component only on the outermost <button>
		// Inner text nodes / spans lack data-ds-component
		await act(async () => {
			root.render(
				createElement(Button, { variant: "primary" }, createElement("span", null, "Save")),
			);
		});

		// Grab the inner <span> — no data-ds-component on it
		const span = container.querySelector("span");
		expect(span).not.toBeNull();
		// The inner span should NOT have data-ds-component
		expect(span?.getAttribute("data-ds-component")).toBeNull();

		const target = resolveComponentTarget(span as Element);

		// Fiber walk should resolve to "Button" (displayName or name of the component function)
		expect(target.component).toBe("Button");
	});

	test("resolveComponentTarget returns an AnnotationTarget shape", async () => {
		await act(async () => {
			root.render(createElement(Button, { variant: "secondary" }, "Click"));
		});

		const btn = container.querySelector("button");
		expect(btn).not.toBeNull();
		const target = resolveComponentTarget(btn as Element);

		// Must have all required fields
		expect(typeof target.component).toBe("string");
		expect(target.component.length).toBeGreaterThan(0);
		// dsComponent is string or null
		expect(target.dsComponent === null || typeof target.dsComponent === "string").toBe(true);
		expect(typeof target.element).toBe("string");
		expect(target.element.length).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// AC1b — data-ds-only branch and no-fiber/no-data-ds branch
// ---------------------------------------------------------------------------

describe("AC1b — resolution chain fallbacks", () => {
	test("node with [data-ds-component] ancestor but NO fiber key → .component equals dsComponent verbatim", () => {
		// Create a bare DOM tree (no React rendering → no fiber keys)
		const wrapper = document.createElement("div");
		wrapper.setAttribute("data-ds-component", "MyWidget");

		const inner = document.createElement("span");
		inner.textContent = "inner text";
		wrapper.appendChild(inner);
		document.body.appendChild(wrapper);

		// inner has no fiber keys, but its ancestor has data-ds-component
		const target = resolveComponentTarget(inner);
		expect(target.component).toBe("MyWidget");

		document.body.removeChild(wrapper);
	});

	test("node with NEITHER fiber key NOR data-ds-component → .component === 'unknown'", () => {
		// Bare DOM node, no React rendering, no data-ds-component anywhere
		const orphan = document.createElement("p");
		orphan.textContent = "no parent";
		document.body.appendChild(orphan);

		const target = resolveComponentTarget(orphan);
		expect(target.component).toBe("unknown");

		document.body.removeChild(orphan);
	});

	test("weak label (data-ds-only) is surfaced verbatim in .component", () => {
		// The resolved component must echo verbatim — never silently substituted
		const wrapper = document.createElement("div");
		wrapper.setAttribute("data-ds-component", "SomeExactName");
		const inner = document.createElement("button");
		wrapper.appendChild(inner);
		document.body.appendChild(wrapper);

		const target = resolveComponentTarget(inner);
		// Must be exact — not "unknown", not modified
		expect(target.component).toBe("SomeExactName");

		document.body.removeChild(wrapper);
	});
});

// ---------------------------------------------------------------------------
// AC2 — dsComponent field (corroboration)
// ---------------------------------------------------------------------------

describe("AC2 — dsComponent corroboration field", () => {
	test("dsComponent is null when no [data-ds-component] ancestor", () => {
		const bare = document.createElement("span");
		document.body.appendChild(bare);

		const target = resolveComponentTarget(bare);
		expect(target.dsComponent).toBeNull();

		document.body.removeChild(bare);
	});

	test("dsComponent equals nearest [data-ds-component] value when present", async () => {
		// Button stamps data-ds-component="Button" on its outer <button>
		await act(async () => {
			root.render(createElement(Button, { variant: "primary" }, "Test"));
		});

		const btn = container.querySelector("button");
		expect(btn).not.toBeNull();
		const target = resolveComponentTarget(btn as Element);

		// dsComponent is the corroboration field — always = nearest data-ds-component
		expect(target.dsComponent).toBe("Button");
	});

	test("dsComponent from ancestor element (inner node case)", async () => {
		// Inner span inside Button — dsComponent should still be "Button" from the nearest ancestor
		await act(async () => {
			root.render(createElement(Button, { variant: "ghost" }, createElement("em", null, "Italic")));
		});

		const em = container.querySelector("em");
		expect(em).not.toBeNull();
		const target = resolveComponentTarget(em as Element);

		// The nearest [data-ds-component] ancestor is the <button data-ds-component="Button">
		expect(target.dsComponent).toBe("Button");
	});

	test("dsComponent null when no data-ds-component in the ancestor chain", () => {
		const parent = document.createElement("div");
		const child = document.createElement("span");
		parent.appendChild(child);
		document.body.appendChild(parent);

		const target = resolveComponentTarget(child);
		expect(target.dsComponent).toBeNull();

		document.body.removeChild(parent);
	});
});

// ---------------------------------------------------------------------------
// AC3 — element descriptor
// ---------------------------------------------------------------------------

describe("AC3 — element descriptor", () => {
	test("descriptor includes the tag name", async () => {
		await act(async () => {
			root.render(createElement(Button, { variant: "primary" }, "Save"));
		});

		const btn = container.querySelector("button");
		expect(btn).not.toBeNull();
		const target = resolveComponentTarget(btn as Element);

		// descriptor must contain the tag
		expect(target.element.toLowerCase()).toContain("button");
	});

	test("descriptor includes class names when present", async () => {
		await act(async () => {
			root.render(createElement(Button, { variant: "primary" }, "Save"));
		});

		const btn = container.querySelector("button");
		expect(btn).not.toBeNull();
		const target = resolveComponentTarget(btn as Element);

		// The button has classes — descriptor should reflect at least part of them
		expect(target.element.length).toBeGreaterThan(4); // more than just the tag
	});

	test("descriptor for a plain div without classes is just the tag", () => {
		const div = document.createElement("div");
		document.body.appendChild(div);

		const target = resolveComponentTarget(div);
		expect(target.element).toContain("div");

		document.body.removeChild(div);
	});

	test("descriptor includes text snippet for text-bearing leaf nodes", async () => {
		await act(async () => {
			root.render(
				createElement(Button, { variant: "primary" }, createElement("span", null, "Save me")),
			);
		});

		const span = container.querySelector("span");
		expect(span).not.toBeNull();
		const target = resolveComponentTarget(span as Element);

		// Short text content should appear in the descriptor
		expect(target.element).toContain("Save me");
	});

	test("descriptor is a non-empty string", () => {
		const el = document.createElement("section");
		document.body.appendChild(el);

		const target = resolveComponentTarget(el);
		expect(typeof target.element).toBe("string");
		expect(target.element.length).toBeGreaterThan(0);

		document.body.removeChild(el);
	});
});
