// AM5 T1 — Tests for the extracted KpiStat + Sparkline base primitives.
// RED phase — these fail until KpiStat.tsx and Sparkline.tsx are authored.

// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

// These imports will fail (red) until KpiStat.tsx / Sparkline.tsx exist
import { KpiStat } from "../KpiStat.js";
import { Sparkline } from "../Sparkline.js";

afterEach(cleanup);

describe("KpiStat (base primitive)", () => {
	it("renders a flex-wrap figure grid with the provided metrics", () => {
		const metrics = [
			{ label: "MRR", value: "$42,180" },
			{ label: "Active users", value: "1,284" },
		];
		const { container } = render(<KpiStat metrics={metrics} />);
		expect(screen.getByText("MRR")).toBeTruthy();
		expect(screen.getByText("$42,180")).toBeTruthy();
		expect(screen.getByText("Active users")).toBeTruthy();
		expect(screen.getByText("1,284")).toBeTruthy();
		// aria-label on section
		expect(container.querySelector('[aria-label="Key metrics"]')).toBeTruthy();
	});

	it("has NO empty/error/loading branch (K0 purity — never returns null or empty for valid metrics)", () => {
		// A base primitive is pure — it renders all metrics; no state-branch escapes
		const { container } = render(<KpiStat metrics={[{ label: "Conversion", value: "3.7%" }]} />);
		const section = container.querySelector('[aria-label="Key metrics"]');
		expect(section).toBeTruthy();
		// Rendered text is present
		expect(section?.textContent).toContain("Conversion");
		expect(section?.textContent).toContain("3.7%");
	});
});

describe("Sparkline (base primitive)", () => {
	it("renders an SVG polyline with the provided series", () => {
		const { container } = render(<Sparkline values={[10, 20, 15, 30]} label="Signups" />);
		const svg = container.querySelector("svg");
		expect(svg).toBeTruthy();
		// aria-label includes the label
		expect(svg?.getAttribute("aria-label")).toBe("Signups sparkline");
		// polyline is present
		const polyline = container.querySelector("polyline");
		expect(polyline).toBeTruthy();
		// stroke is the accent token (not a hardcoded color)
		expect(polyline?.getAttribute("stroke")).toBe("var(--accent-primary)");
	});

	it("renders 80×24 viewBox (the canonical small-sparkline size)", () => {
		const { container } = render(<Sparkline values={[1, 2, 3]} label="test" />);
		const svg = container.querySelector("svg");
		expect(svg?.getAttribute("width")).toBe("80");
		expect(svg?.getAttribute("height")).toBe("24");
		expect(svg?.getAttribute("viewBox")).toBe("0 0 80 24");
	});

	it("has NO empty/error/loading branch (K0 purity — never returns null for non-empty series)", () => {
		// A single-value series still renders without crash
		const { container } = render(<Sparkline values={[42]} label="single" />);
		const svg = container.querySelector("svg");
		expect(svg).toBeTruthy();
	});
});
