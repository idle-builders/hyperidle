/**
 * AM1 — Fold (promoted to the design system). RED phase.
 *
 * The calm collapse-to-summary device (concept §Fold). A quiet collapsed line:
 * optional label · accent CTA ("Show" / "Show session"). `onShow` makes it live
 * — the session fold opens the session dial-in; the work-fold expands the trace.
 * No card, no border (round-7 lock — the heavy session card is dead).
 *
 * RED until `framework/design-system/src/Fold.tsx` exists + is barrel-exported
 * (green-phase task 4).
 */

// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Fold } from "../Fold.js";

describe("Fold — calm collapse-to-summary device", () => {
	it("renders the CTA text", () => {
		render(<Fold cta="Show session" />);
		expect(screen.getByText("Show session")).toBeDefined();
	});

	it("renders an optional label before the CTA", () => {
		render(<Fold label="Worked for 1m 12s" cta="Show" />);
		expect(screen.getByText("Worked for 1m 12s")).toBeDefined();
		expect(screen.getByText("Show")).toBeDefined();
	});

	it("carries the data-ds-component=Fold marker", () => {
		render(<Fold cta="Show" />);
		expect(document.querySelector('[data-ds-component="Fold"]')).not.toBeNull();
	});

	it("fires onShow when clicked (the live dial-in hook)", () => {
		const onShow = vi.fn();
		render(<Fold cta="Show session" onShow={onShow} />);
		fireEvent.click(screen.getByText("Show session"));
		expect(onShow).toHaveBeenCalledTimes(1);
	});

	it("renders as a button, not a card/border chrome (round-7 lock)", () => {
		render(<Fold cta="Show" />);
		const el = document.querySelector('[data-ds-component="Fold"]');
		expect(el?.tagName.toLowerCase()).toBe("button");
	});
});
