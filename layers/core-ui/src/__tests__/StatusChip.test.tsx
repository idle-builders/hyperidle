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

	it("renders all six status values with their own uppercase text", () => {
		const statuses: Status[] = ["healthy", "behind", "blocked", "paused", "done", "error"];
		for (const status of statuses) {
			const { unmount } = render(<StatusChip status={status} />);
			expect(screen.getByText(status.toUpperCase())).toBeInTheDocument();
			unmount();
		}
	});

	it("distinguishes blocked from error by their own text, though both read as danger", () => {
		// blocked (waiting/recoverable) and error (broken/intervention required)
		// must be distinguishable even though today's palette gives both the
		// same danger color — the word itself is what a person actually reads.
		const { unmount } = render(<StatusChip status="blocked" />);
		expect(screen.getByText("BLOCKED")).toBeInTheDocument();
		unmount();

		render(<StatusChip status="error" />);
		expect(screen.getByText("ERROR")).toBeInTheDocument();
	});

	describe("runtime defense", () => {
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
	});
});
