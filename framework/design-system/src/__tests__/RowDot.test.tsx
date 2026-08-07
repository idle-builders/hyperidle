/**
 * AG6 red phase — RowDot component tests.
 *
 * AC-1: RowDot is a catalogued design-system primitive.
 * AC-3: Rows share one treatment — RowDot is the canonical status dot.
 *
 * Tests FAIL until framework/design-system/src/RowDot.tsx is created (T1).
 */

import React from "react";
import * as ReactDOMServer from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RowDot } from "../RowDot.js";

describe("RowDot (AG6 T1)", () => {
	describe("exports", () => {
		it("is exported from RowDot.tsx as a function", () => {
			expect(typeof RowDot).toBe("function");
		});
	});

	describe("tone → --status-* token", () => {
		it("success tone renders --status-success color token", () => {
			const html = ReactDOMServer.renderToStaticMarkup(
				React.createElement(RowDot, { tone: "success" }),
			);
			expect(html).toContain("--status-success");
		});

		it("warning tone renders --status-warning color token", () => {
			const html = ReactDOMServer.renderToStaticMarkup(
				React.createElement(RowDot, { tone: "warning" }),
			);
			expect(html).toContain("--status-warning");
		});

		it("error tone renders --status-error color token", () => {
			const html = ReactDOMServer.renderToStaticMarkup(
				React.createElement(RowDot, { tone: "error" }),
			);
			expect(html).toContain("--status-error");
		});

		it("info tone renders --status-info color token", () => {
			const html = ReactDOMServer.renderToStaticMarkup(
				React.createElement(RowDot, { tone: "info" }),
			);
			expect(html).toContain("--status-info");
		});

		it("neutral tone renders --text-tertiary token (not a status-* color)", () => {
			const html = ReactDOMServer.renderToStaticMarkup(
				React.createElement(RowDot, { tone: "neutral" }),
			);
			expect(html).toContain("--text-tertiary");
			// neutral must NOT map to a status-* token
			expect(html).not.toContain("--status-success");
			expect(html).not.toContain("--status-warning");
			expect(html).not.toContain("--status-error");
			expect(html).not.toContain("--status-info");
		});
	});

	describe("label → a11y", () => {
		it("label present → role=img + aria-label", () => {
			const html = ReactDOMServer.renderToStaticMarkup(
				React.createElement(RowDot, { tone: "success", label: "Healthy" }),
			);
			expect(html).toContain('role="img"');
			expect(html).toContain('aria-label="Healthy"');
		});

		it("label absent → aria-hidden=true", () => {
			const html = ReactDOMServer.renderToStaticMarkup(
				React.createElement(RowDot, { tone: "success" }),
			);
			expect(html).toContain('aria-hidden="true"');
		});

		it("label absent → does NOT include role=img", () => {
			const html = ReactDOMServer.renderToStaticMarkup(
				React.createElement(RowDot, { tone: "neutral" }),
			);
			expect(html).not.toContain('role="img"');
		});
	});

	describe("shape", () => {
		it("renders a 6px circle (w-[6px] h-[6px])", () => {
			const html = ReactDOMServer.renderToStaticMarkup(
				React.createElement(RowDot, { tone: "success" }),
			);
			expect(html).toContain("w-[6px]");
			expect(html).toContain("h-[6px]");
		});

		it("is circular (rounded-full)", () => {
			const html = ReactDOMServer.renderToStaticMarkup(
				React.createElement(RowDot, { tone: "success" }),
			);
			expect(html).toContain("rounded-full");
		});

		it("does NOT include animate-pulse (RowDot is static, not LiveDot)", () => {
			const html = ReactDOMServer.renderToStaticMarkup(
				React.createElement(RowDot, { tone: "success" }),
			);
			// LiveDot pulses; RowDot is a static status dot
			expect(html).not.toContain("animate-pulse");
		});
	});
});
