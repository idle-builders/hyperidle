/**
 * AI4 — One status language: LiveDot component tests (red phase)
 *
 * AC3: The live-activity pulse appears wherever an in-progress/live state is
 * shown — one component, same signal, every surface.
 *
 * Plan Task 5: Promote LiveDot from WorkTask/TaskSheet to the design system
 * as a standalone component with the exact body:
  *   aria-hidden inline-block w-[6px] h-[6px] rounded-[var(--r-pill)]
 *   bg-[var(--accent-primary)] animate-pulse shrink-0
 *
 * NOTE: This test lives in design-system/__tests__ because LiveDot is a
 * design-system primitive. The test uses renderToStaticMarkup / lightweight
 * snapshot assertions that don't need a full DOM, OR we rely on the
 * no-jsdom pattern that the design-system W2-primitives.test uses.
 *
 * These tests FAIL until LiveDot is created at
 * `framework/design-system/src/LiveDot.tsx` and exported from index.ts.
 */

import React from "react";
// Import as a module check first — rendering via renderToStaticMarkup avoids jsdom
import * as ReactDOMServer from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LiveDot } from "../index.js";

describe("LiveDot (AI4 AC3, Task 5)", () => {
	it("is exported from the design-system index", () => {
		expect(LiveDot).toBeDefined();
		expect(typeof LiveDot).toBe("function");
	});

	it("renders to static HTML (server render — no jsdom needed)", () => {
		const html = ReactDOMServer.renderToStaticMarkup(React.createElement(LiveDot));
		expect(html).toBeTruthy();
		expect(html.length).toBeGreaterThan(0);
	});

	it("rendered HTML includes aria-hidden attribute", () => {
		const html = ReactDOMServer.renderToStaticMarkup(React.createElement(LiveDot));
		expect(html).toContain('aria-hidden="true"');
	});

	it("rendered HTML includes animate-pulse class", () => {
		const html = ReactDOMServer.renderToStaticMarkup(React.createElement(LiveDot));
		expect(html).toContain("animate-pulse");
	});

	it("rendered HTML includes 6px width and height classes", () => {
		const html = ReactDOMServer.renderToStaticMarkup(React.createElement(LiveDot));
		expect(html).toContain("w-[6px]");
		expect(html).toContain("h-[6px]");
	});

	it("rendered HTML includes rounded-[var(--r-pill)] class (circular dot)", () => {
		const html = ReactDOMServer.renderToStaticMarkup(React.createElement(LiveDot));
		expect(html).toContain("rounded-[var(--r-pill)]");
	});

	it("rendered HTML uses accent-primary token (no hardcoded color)", () => {
		const html = ReactDOMServer.renderToStaticMarkup(React.createElement(LiveDot));
		expect(html).toContain("--accent-primary");
	});

	it("rendered HTML includes shrink-0 (prevents flex-shrink)", () => {
		const html = ReactDOMServer.renderToStaticMarkup(React.createElement(LiveDot));
		expect(html).toContain("shrink-0");
	});

	it("rendered HTML includes inline-block", () => {
		const html = ReactDOMServer.renderToStaticMarkup(React.createElement(LiveDot));
		expect(html).toContain("inline-block");
	});
});
