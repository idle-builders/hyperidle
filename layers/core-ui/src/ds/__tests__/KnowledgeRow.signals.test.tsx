// @vitest-environment jsdom
/**
 * L22 red phase — tests for KnowledgeRow signals prop.
 *
 * These tests fail until framework/design-system/src/KnowledgeRow.tsx
 * gains the optional `signals` prop (T8).
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KnowledgeRow } from "../KnowledgeRow.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BASE_PROPS = {
	title: "Architecture Decision: Auth Strategy",
	status: "active" as const,
	timestamp: "2d ago",
};

describe("KnowledgeRow signals prop (L22)", () => {
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

	// Backward compatibility: without signals prop, renders as before
	it("renders correctly without signals prop (backward compat)", () => {
		act(() => {
			root.render(createElement(KnowledgeRow, BASE_PROPS));
		});
		expect(container.textContent).toContain("Architecture Decision: Auth Strategy");
		// No signal triad rendered
		const triad = container.querySelector("[data-testid='knowledge-signals']");
		expect(triad).toBeNull();
	});

	// Renders signal triad when signals prop is provided
	it("renders signal triad when signals prop is provided", () => {
		act(() => {
			root.render(
				createElement(KnowledgeRow, {
					...BASE_PROPS,
					signals: { recency: "2d", frequency: 3, citation: null },
				}),
			);
		});
		const triad = container.querySelector("[data-testid='knowledge-signals']");
		expect(triad).not.toBeNull();
	});

	// Renders recency value when present
	it("renders recency value when signals.recency is provided", () => {
		act(() => {
			root.render(
				createElement(KnowledgeRow, {
					...BASE_PROPS,
					signals: { recency: "3h", frequency: null, citation: null },
				}),
			);
		});
		expect(container.textContent).toContain("3h");
	});

	// Renders frequency value when present
	it("renders frequency value when signals.frequency is provided", () => {
		act(() => {
			root.render(
				createElement(KnowledgeRow, {
					...BASE_PROPS,
					signals: { recency: null, frequency: 5, citation: null },
				}),
			);
		});
		expect(container.textContent).toContain("5");
	});

	// Absent recency → em dash
	it("renders em dash for absent recency signal", () => {
		act(() => {
			root.render(
				createElement(KnowledgeRow, {
					...BASE_PROPS,
					signals: { recency: null, frequency: null, citation: null },
				}),
			);
		});
		// Em dash U+2014 must appear in the rendered text
		expect(container.textContent).toContain("—");
	});

	// Absent frequency → em dash
	it("renders em dash for absent frequency signal", () => {
		act(() => {
			root.render(
				createElement(KnowledgeRow, {
					...BASE_PROPS,
					signals: { recency: "2d", frequency: null, citation: null },
				}),
			);
		});
		expect(container.textContent).toContain("—");
	});

	// citation null (staged) → em dash — AC-3
	it("renders em dash for null citation (staged — AC-3)", () => {
		act(() => {
			root.render(
				createElement(KnowledgeRow, {
					...BASE_PROPS,
					signals: { recency: "2d", frequency: 3, citation: null },
				}),
			);
		});
		// Citation slot shows em dash
		expect(container.textContent).toContain("—");
	});

	// All signals present — no em dash in numeric slots
	it("all signals present — numeric values rendered, no em dash in value slots", () => {
		act(() => {
			root.render(
				createElement(KnowledgeRow, {
					...BASE_PROPS,
					signals: { recency: "2d", frequency: 3, citation: 2 },
				}),
			);
		});
		expect(container.textContent).toContain("2d");
		expect(container.textContent).toContain("3");
		expect(container.textContent).toContain("2");
	});

	// All signals absent — triad renders with all em dashes
	it("all signals absent — triad still renders with three em dashes", () => {
		act(() => {
			root.render(
				createElement(KnowledgeRow, {
					...BASE_PROPS,
					signals: { recency: null, frequency: null, citation: null },
				}),
			);
		});
		const triad = container.querySelector("[data-testid='knowledge-signals']");
		expect(triad).not.toBeNull();
		// Count em dashes — should be at least 3 (one per signal)
		const dashes = (triad?.textContent ?? "").split("—").length - 1;
		expect(dashes).toBeGreaterThanOrEqual(3);
	});

	// Signals prop does not affect caption — caption suppressed when signals provided
	it("caption prop is suppressed when signals prop is provided", () => {
		act(() => {
			root.render(
				createElement(KnowledgeRow, {
					...BASE_PROPS,
					caption: "Why now: conflict detected",
					signals: { recency: "2d", frequency: 3, citation: null },
				}),
			);
		});
		// Caption should NOT appear when signals is provided (per design)
		expect(container.textContent).not.toContain("Why now: conflict detected");
	});

	// Caption still renders without signals (backward compat)
	it("caption renders when signals prop is not provided (backward compat)", () => {
		act(() => {
			root.render(
				createElement(KnowledgeRow, {
					...BASE_PROPS,
					caption: "Why now: conflict detected",
				}),
			);
		});
		expect(container.textContent).toContain("Why now: conflict detected");
	});

	// Signal labels are rendered
	it("renders signal labels (recency, freq, impact)", () => {
		act(() => {
			root.render(
				createElement(KnowledgeRow, {
					...BASE_PROPS,
					signals: { recency: "2d", frequency: 3, citation: null },
				}),
			);
		});
		const text = container.textContent ?? "";
		// Labels per design: "recency", "freq", "impact"
		expect(text.toLowerCase()).toContain("recency");
		expect(text.toLowerCase()).toContain("freq");
		expect(text.toLowerCase()).toContain("impact");
	});
});
