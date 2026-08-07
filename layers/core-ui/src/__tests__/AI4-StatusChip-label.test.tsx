/**
 * AI4 — One status language: StatusChip `label` prop tests (red phase)
 *
 * Decision 1 / Decision 1a — The casing contract:
 *   - Default path (no label): renders safeStatus.toUpperCase() in DOM → textContent = "HEALTHY"
 *   - label path: renders label VERBATIM into DOM — no JS .toUpperCase().
 *     CSS `uppercase` class in CHIP_BASE provides visual uppercase, but
 *     textContent stays as the supplied string (e.g. "Active").
 *
 * This is load-bearing: BetCard.test.tsx asserts getByText("Active") against
 * textContent. If JS uppercasing were applied to label, textContent="ACTIVE"
 * and those tests break.
 *
 * These tests FAIL until `label?: string` is added to StatusChipProps and the
 * JSX renders `{label ? label : safeStatus.toUpperCase()}`.
 */

import { StatusChip } from "@hyperidle/design-system";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("StatusChip label prop (AI4 Decision 1)", () => {
	describe("default path (no label) — unchanged existing behavior", () => {
		it("renders status name uppercased in DOM when no label provided", () => {
			render(<StatusChip status="healthy" />);
			expect(screen.getByText("HEALTHY")).toBeInTheDocument();
		});

		it("textContent is uppercase status name when no label", () => {
			const { container } = render(<StatusChip status="healthy" />);
			const chip = container.querySelector("[data-status='healthy']");
			expect(chip?.textContent).toContain("HEALTHY");
		});
	});

	describe("label path — verbatim render, casing contract Decision 1a", () => {
		it("renders supplied label verbatim (no JS uppercasing)", () => {
			render(<StatusChip status="healthy" label="Active" />);
			// Must find "Active" (Title-Case), NOT "ACTIVE" (JS-uppercased)
			expect(screen.getByText("Active")).toBeInTheDocument();
		});

		it("textContent equals the supplied label string exactly", () => {
			const { container } = render(<StatusChip status="healthy" label="Active" />);
			const chip = container.querySelector("[data-status='healthy']");
			// textContent must be "Active" not "ACTIVE"
			// chip may also contain the dot span; match partial text
			expect(chip?.textContent).toContain("Active");
		});

		it("does NOT uppercase the label in textContent (CSS handles visual casing)", () => {
			const { container } = render(<StatusChip status="healthy" label="In progress" />);
			const chip = container.querySelector("[data-status='healthy']");
			// textContent must NOT be "IN PROGRESS"
			expect(chip?.textContent).not.toContain("IN PROGRESS");
			expect(chip?.textContent).toContain("In progress");
		});

		it("renders 'On hold' verbatim for hold state", () => {
			render(<StatusChip status="paused" label="On hold" />);
			expect(screen.getByText("On hold")).toBeInTheDocument();
		});

		it("renders 'In review' verbatim for review state", () => {
			render(<StatusChip status="behind" label="In review" />);
			expect(screen.getByText("In review")).toBeInTheDocument();
		});

		it("renders 'Draft' verbatim for bet draft status", () => {
			render(<StatusChip status="paused" label="Draft" />);
			expect(screen.getByText("Draft")).toBeInTheDocument();
		});

		it("renders 'Completed' verbatim for bet completed status", () => {
			render(<StatusChip status="done" label="Completed" />);
			expect(screen.getByText("Completed")).toBeInTheDocument();
		});

		it("renders 'Killed' verbatim for killed states", () => {
			render(<StatusChip status="error" label="Killed" />);
			expect(screen.getByText("Killed")).toBeInTheDocument();
		});

		it("renders uppercase shortLabel verbatim ('REVIEW') for notification type", () => {
			// Decision 4 / Decision 1a casing pin: shortLabel is stored uppercase,
			// so textContent = "REVIEW" (no JS transform needed, registry already uppercase)
			render(<StatusChip status="behind" label="REVIEW" />);
			expect(screen.getByText("REVIEW")).toBeInTheDocument();
		});

		it("still applies status-based dot and chip chrome when label is provided", () => {
			const { container } = render(<StatusChip status="healthy" label="Active" />);
			// The dot must still be present
			const dot = container.querySelector("span > span");
			expect(dot).toBeInTheDocument();
			expect(dot).toHaveClass("rounded-full");
		});

		it("data-status attribute reflects the status prop even when label is set", () => {
			render(<StatusChip status="healthy" label="Active" />);
			const chip = screen.getByText("Active").closest("[data-status]");
			expect(chip).toHaveAttribute("data-status", "healthy");
		});

		it("still has correct color classes from status when label is provided", () => {
			render(<StatusChip status="healthy" label="Active" />);
			const chip = screen.getByText("Active");
			expect(chip.className).toContain("text-[var(--status-success)]");
		});

		it("chip still has inline-flex and rounded-full when label is provided", () => {
			render(<StatusChip status="paused" label="Draft" />);
			const chip = screen.getByText("Draft");
			expect(chip).toHaveClass("inline-flex", "rounded-full");
		});
	});

	describe("casing contract proof (BetCard protected assertions pattern)", () => {
		it("getByText('Active') succeeds with label='Active' — BetCard assertion preserved", () => {
			render(<StatusChip status="healthy" label="Active" />);
			// This is the exact pattern BetCard.test.tsx uses
			expect(screen.getByText("Active")).toBeInTheDocument();
		});

		it("getByText('Draft') succeeds with label='Draft'", () => {
			render(<StatusChip status="paused" label="Draft" />);
			expect(screen.getByText("Draft")).toBeInTheDocument();
		});

		it("getByText('Completed') succeeds with label='Completed'", () => {
			render(<StatusChip status="done" label="Completed" />);
			expect(screen.getByText("Completed")).toBeInTheDocument();
		});

		it("getByText('Killed') succeeds with label='Killed'", () => {
			render(<StatusChip status="error" label="Killed" />);
			expect(screen.getByText("Killed")).toBeInTheDocument();
		});
	});
});
