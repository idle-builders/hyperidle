/**
 * StatusChip: without a `label`, the status name renders uppercased; with a
 * `label`, that string renders verbatim — CSS handles the visual casing, no
 * JS transform runs on a caller-supplied label (`label="In progress"` must
 * never become "IN PROGRESS" in the DOM).
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { type Status, StatusChip } from "../ds";

describe("StatusChip", () => {
	it("renders status text in uppercase when no label is given", () => {
		render(<StatusChip status="healthy" />);
		expect(screen.getByText("HEALTHY")).toBeInTheDocument();
	});

	it("has a tooltip carrying the raw status text", () => {
		render(<StatusChip status="blocked" />);
		expect(screen.getByText("BLOCKED")).toHaveAttribute("title", "blocked");
	});

	it("renders all six status values, each with its own data-status attribute", () => {
		const statuses: Status[] = ["healthy", "behind", "blocked", "paused", "done", "error"];
		for (const status of statuses) {
			const { unmount } = render(<StatusChip status={status} />);
			const chip = screen.getByText(status.toUpperCase());
			expect(chip).toHaveAttribute("data-status", status);
			unmount();
		}
	});

	it("distinguishes blocked from error via data-status, though both read as danger", () => {
		// I4 S7: blocked (waiting/recoverable) and error (broken/intervention
		// required) must be distinguishable even though today's palette gives
		// both the same danger color — the data-status attribute is the
		// stable, non-visual signal a caller can tell them apart by.
		const { unmount } = render(<StatusChip status="blocked" />);
		expect(screen.getByText("BLOCKED")).toHaveAttribute("data-status", "blocked");
		unmount();

		render(<StatusChip status="error" />);
		expect(screen.getByText("ERROR")).toHaveAttribute("data-status", "error");
	});

	describe("runtime defense (adversary W4)", () => {
		it("renders an UNKNOWN chip, never the literal word 'undefined', when status is undefined at runtime", () => {
			// Trust-boundary defence: server/web version skew may send a new
			// BetStatus that hasn't been mapped yet, and upstream lookups can
			// hand StatusChip an undefined.
			const undefinedStatus = undefined as unknown as Status;
			render(<StatusChip status={undefinedStatus} />);
			expect(screen.getByText("UNKNOWN")).toBeInTheDocument();
		});

		it("renders an UNKNOWN chip for a non-canonical status string", () => {
			const bogus = "cancelled" as unknown as Status;
			render(<StatusChip status={bogus} />);
			expect(screen.getByText("UNKNOWN")).toBeInTheDocument();
		});
	});

	describe("label prop: verbatim render, no JS uppercasing", () => {
		it.each([
			["Active", "healthy"],
			["On hold", "paused"],
			["In review", "behind"],
			["Draft", "paused"],
			["Completed", "done"],
			["Killed", "error"],
			// Decision 4: shortLabel is stored uppercase already — no JS transform needed.
			["REVIEW", "behind"],
		] as const)("renders label '%s' verbatim for status '%s'", (label, status) => {
			render(<StatusChip status={status} label={label} />);
			expect(screen.getByText(label)).toBeInTheDocument();
		});

		it("does not uppercase a mixed-case label", () => {
			render(<StatusChip status="healthy" label="In progress" />);
			expect(screen.queryByText("IN PROGRESS")).not.toBeInTheDocument();
			expect(screen.getByText("In progress")).toBeInTheDocument();
		});

		it("data-status attribute still reflects the status prop when label is set", () => {
			render(<StatusChip status="healthy" label="Active" />);
			expect(screen.getByText("Active").closest("[data-status]")).toHaveAttribute(
				"data-status",
				"healthy",
			);
		});
	});
});
