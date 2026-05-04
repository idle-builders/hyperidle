// @vitest-environment jsdom
/**
 * L15 — Tag `unread` prop assertions.
 *
 * The pre-L15 Tag accepted `label` + optional `kind` (registry-driven icon
 * tag). L15 adds an `unread?: boolean` prop that renders a structurally
 * different chip: leading `--primary` dot span + primary tint background.
 * `unread` is mutually exclusive with `kind` — when both are set, `kind`
 * wins (the dot is skipped).
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Tag } from "../Tag.js";

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

function renderTag(props: Parameters<typeof Tag>[0]): void {
	act(() => root.render(createElement(Tag, props)));
}

describe("Tag — unread variant (L15)", () => {
	it("renders a leading unread dot span and applies the primary tint when unread is true", () => {
		renderTag({ label: "3", unread: true });
		const tag = container.querySelector("span");
		expect(tag).not.toBeNull();
		// (a1) The chip carries the primary tint background — color-mix on --primary.
		expect(container.innerHTML).toMatch(/--primary/);
		// (a2) A leading <span> with the unread-dot testid renders. The dot is
		// a CSS-attached background, NOT a unicode glyph (AQ-105 forbids
		// emoji-as-iconography).
		const dot = container.querySelector('[data-testid="tag-unread-dot"]');
		expect(dot).not.toBeNull();
		expect(dot?.tagName).toBe("SPAN");
		// (a3) The label text still renders.
		expect(container.textContent).toContain("3");
	});

	it("skips the unread branch when both unread and kind are set (kind wins)", () => {
		renderTag({ label: "repeating", unread: true, kind: "pattern" });
		// kind="pattern" renders the icon variant (an SVG). The unread dot
		// must NOT render — the two states are mutually exclusive per design.
		expect(container.querySelector("svg")).not.toBeNull();
		expect(container.querySelector('[data-testid="tag-unread-dot"]')).toBeNull();
	});

	it("renders the default neutral chip unchanged when neither unread nor kind is set", () => {
		renderTag({ label: "bet" });
		const tag = container.querySelector("span");
		expect(tag).not.toBeNull();
		expect(tag?.className).toContain("inline-flex");
		expect(tag?.className).toContain("rounded-[var(--r2)]");
		expect(tag?.className).toContain("text-[12px]");
		expect(tag?.className).toContain("bg-[var(--surface-ghost)]");
		expect(tag?.className).toContain("text-[var(--text-mid)]");
		// No unread dot, no SVG.
		expect(container.querySelector('[data-testid="tag-unread-dot"]')).toBeNull();
		expect(container.querySelector("svg")).toBeNull();
	});
});
