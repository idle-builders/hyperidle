import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ReasoningBlock } from "../components/ReasoningBlock";

describe("ReasoningBlock", () => {
	const steps = [
		"Identified the user story constraint",
		"Scanned existing diff utilities for reuse",
		"Wrote failing test for the sort order",
		"Implemented the minimum fix",
		"Verified with the existing Vitest suite",
	];

	describe("default collapsed state", () => {
		it("does not render the steps list until expanded", () => {
			render(<ReasoningBlock steps={steps} />);
			// Trigger button present
			expect(screen.getByRole("button", { name: /reasoning/i })).toBeInTheDocument();
			// Steps hidden (panel hidden)
			const panel = screen.queryByRole("list", { name: /reasoning steps/i });
			expect(panel).toBeNull();
		});

		it("reports aria-expanded=false on the trigger", () => {
			render(<ReasoningBlock steps={steps} />);
			const btn = screen.getByRole("button", { name: /reasoning/i });
			expect(btn).toHaveAttribute("aria-expanded", "false");
		});
	});

	describe("expansion", () => {
		it("renders all steps as an ordered list after click", async () => {
			const user = userEvent.setup();
			render(<ReasoningBlock steps={steps} />);
			await user.click(screen.getByRole("button", { name: /reasoning/i }));
			const list = screen.getByRole("list", { name: /reasoning steps/i });
			expect(list.tagName).toBe("OL");
			const items = screen.getAllByRole("listitem");
			expect(items).toHaveLength(5);
			// First item text present
			expect(items[0]).toHaveTextContent("Identified the user story constraint");
			expect(items[4]).toHaveTextContent("Verified with the existing Vitest suite");
		});

		it("collapses again on second click", async () => {
			const user = userEvent.setup();
			render(<ReasoningBlock steps={steps} />);
			const btn = screen.getByRole("button", { name: /reasoning/i });
			await user.click(btn);
			await user.click(btn);
			expect(screen.queryByRole("list", { name: /reasoning steps/i })).toBeNull();
			expect(btn).toHaveAttribute("aria-expanded", "false");
		});
	});

	describe("defaultOpen prop", () => {
		it("renders steps immediately when defaultOpen=true", () => {
			render(<ReasoningBlock steps={steps} defaultOpen={true} />);
			expect(screen.getByRole("list", { name: /reasoning steps/i })).toBeInTheDocument();
			expect(screen.getByRole("button", { name: /reasoning/i })).toHaveAttribute(
				"aria-expanded",
				"true",
			);
		});
	});

	describe("step count display", () => {
		it("shows the step count on the trigger", () => {
			render(<ReasoningBlock steps={steps} />);
			const btn = screen.getByRole("button", { name: /reasoning/i });
			// Should include the number 5 somewhere in accessible name
			expect(btn.textContent ?? "").toMatch(/5/);
		});

		it("uses singular label for 1 step", () => {
			render(<ReasoningBlock steps={["only step"]} />);
			const btn = screen.getByRole("button", { name: /reasoning/i });
			expect(btn.textContent ?? "").toMatch(/1 step\b/i);
		});

		it("uses plural label for multiple steps", () => {
			render(<ReasoningBlock steps={steps} />);
			const btn = screen.getByRole("button", { name: /reasoning/i });
			expect(btn.textContent ?? "").toMatch(/5 steps/i);
		});
	});

	describe("empty state", () => {
		it("renders nothing when steps is empty", () => {
			const { container } = render(<ReasoningBlock steps={[]} />);
			expect(container.firstChild).toBeNull();
		});
	});

	describe("numbered list", () => {
		it("renders an ordered list so numbering is native HTML", async () => {
			const user = userEvent.setup();
			render(<ReasoningBlock steps={steps} />);
			await user.click(screen.getByRole("button", { name: /reasoning/i }));
			const list = screen.getByRole("list", { name: /reasoning steps/i });
			expect(list.tagName).toBe("OL");
		});
	});
});
