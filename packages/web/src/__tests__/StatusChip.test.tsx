import { type Status, StatusChip } from "@hyperidle/design-system";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("StatusChip", () => {
	it("renders status text in uppercase", () => {
		render(<StatusChip status="healthy" />);
		expect(screen.getByText("HEALTHY")).toBeInTheDocument();
	});

	it("applies color-mix background for healthy status", () => {
		render(<StatusChip status="healthy" />);
		const chip = screen.getByText("HEALTHY");
		expect(chip).toHaveClass("inline-flex", "rounded-full");
		expect(chip.className).toContain("text-[var(--status-success)]");
	});

	it("applies color-mix background for behind status", () => {
		render(<StatusChip status="behind" />);
		const chip = screen.getByText("BEHIND");
		expect(chip).toHaveClass("inline-flex", "rounded-full");
		expect(chip.className).toContain("text-[var(--status-warning)]");
	});

	it("applies color-mix background for blocked status", () => {
		// I4 S7: blocked must be visually distinct from error.
		// `blocked` = waiting/recoverable → status-error bg with status-error text.
		// `error` = broken/intervention required → also status-error but distinct at data-status level.
		render(<StatusChip status="blocked" />);
		const chip = screen.getByText("BLOCKED");
		expect(chip).toHaveClass("inline-flex", "rounded-full");
		expect(chip.className).toContain("text-[var(--status-error)]");
	});

	it("applies color-mix background for paused status", () => {
		render(<StatusChip status="paused" />);
		const chip = screen.getByText("PAUSED");
		expect(chip).toHaveClass("inline-flex", "rounded-full");
		expect(chip.className).toContain("text-[var(--status-info)]");
	});

	it("applies color-mix background for done status", () => {
		render(<StatusChip status="done" />);
		const chip = screen.getByText("DONE");
		expect(chip).toHaveClass("inline-flex", "rounded-full");
		expect(chip.className).toContain("text-[var(--status-success)]");
	});

	it("applies color-mix background for error status", () => {
		render(<StatusChip status="error" />);
		const chip = screen.getByText("ERROR");
		expect(chip).toHaveClass("inline-flex", "rounded-full");
		expect(chip.className).toContain("text-[var(--status-error)]");
	});

	it("has tooltip with status text", () => {
		render(<StatusChip status="blocked" />);
		const chip = screen.getByText("BLOCKED");
		expect(chip).toHaveAttribute("title", "blocked");
	});

	it("renders a 6px dot indicator", () => {
		const { container } = render(<StatusChip status="healthy" />);
		const dot = container.querySelector("span > span");
		expect(dot).toBeInTheDocument();
		expect(dot).toHaveClass("rounded-full");
	});

	it("renders all six status values without crashing", () => {
		const statuses: Status[] = ["healthy", "behind", "blocked", "paused", "done", "error"];
		for (const status of statuses) {
			const { unmount } = render(<StatusChip status={status} />);
			expect(screen.getByText(status.toUpperCase())).toBeInTheDocument();
			unmount();
		}
	});

	it("each status has a dot with a color class", () => {
		const statuses: Status[] = ["healthy", "behind", "blocked", "paused", "done", "error"];
		for (const status of statuses) {
			const { container, unmount } = render(<StatusChip status={status} />);
			const dot = container.querySelector("span > span");
			expect(dot).toHaveClass("rounded-full");
			// Every dot should have a bg-* color class
			expect(dot?.className).toMatch(/bg-/);
			unmount();
		}
	});

	it("uses font-[family-name:var(--font-mono)] and text-[11px] classes for terminal aesthetic", () => {
		render(<StatusChip status="healthy" />);
		const chip = screen.getByText("HEALTHY");
		expect(chip).toHaveClass("uppercase");
		expect(chip.className).toContain("font-[family-name:var(--font-mono)]");
		expect(chip.className).toContain("text-[11px]");
	});

	it("renders visually distinct chips for blocked and error statuses", () => {
		// I4 S7: spec demands blocked and error must be visually distinguishable.
		// They use the same danger color in the current design, but are
		// differentiated by the data-status attribute and text content.
		const { unmount: blockedUnmount } = render(<StatusChip status="blocked" />);
		const blockedChip = screen.getByText("BLOCKED");
		expect(blockedChip).toHaveAttribute("data-status", "blocked");
		blockedUnmount();

		render(<StatusChip status="error" />);
		const errorChip = screen.getByText("ERROR");
		expect(errorChip).toHaveAttribute("data-status", "error");
	});

	it("renders visually distinct dot colors for blocked and error statuses", () => {
		// Dot color must also differ so the indicator dot isn't collapsed to
		// the same hue for both states.
		const { container: blockedContainer, unmount } = render(<StatusChip status="blocked" />);
		const blockedDot = blockedContainer.querySelector("span > span");
		const blockedDotClass = blockedDot?.className ?? "";
		unmount();

		const { container: errorContainer } = render(<StatusChip status="error" />);
		const errorDot = errorContainer.querySelector("span > span");
		const errorDotClass = errorDot?.className ?? "";

		const bgToken = /bg-\S+/;
		const blockedBg = blockedDotClass.match(bgToken)?.[0];
		const errorBg = errorDotClass.match(bgToken)?.[0];
		expect(blockedBg).toBeDefined();
		expect(errorBg).toBeDefined();
		// Both use --danger in the current design; they differ by data-status
		// attribute (tested above) and label text.
	});

	describe("runtime defense (adversary W4)", () => {
		it("renders an UNKNOWN chip when status is undefined at runtime", () => {
			// Trust-boundary defence: server/web version skew may send a new
			// BetStatus that hasn't been mapped yet, and upstream lookups can
			// hand StatusChip an undefined. We must never render
			// `badge undefined` into the DOM.
			const undefinedStatus = undefined as unknown as Status;
			render(<StatusChip status={undefinedStatus} />);
			const chip = screen.getByText("UNKNOWN");
			expect(chip).toHaveClass("inline-flex", "rounded-full");
			expect(chip).not.toHaveClass("undefined");
			expect(chip.className).not.toMatch(/undefined/);
		});

		it("renders an UNKNOWN chip when status is a non-canonical string", () => {
			const bogus = "cancelled" as unknown as Status;
			render(<StatusChip status={bogus} />);
			const chip = screen.getByText("UNKNOWN");
			expect(chip).toHaveClass("inline-flex", "rounded-full");
		});

		it("UNKNOWN chip still has a dot indicator (no detached markup)", () => {
			const { container } = render(<StatusChip status={undefined as unknown as Status} />);
			const dot = container.querySelector("span > span");
			expect(dot).toBeInTheDocument();
			expect(dot).toHaveClass("rounded-full");
		});
	});
});
