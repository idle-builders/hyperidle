import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ReviewHeader } from "../shell/ReviewHeader";

describe("ReviewHeader blocking → Pause button (J4)", () => {
	const baseProps = {
		proposer: { name: "Agent-Alpha", timestamp: "2m ago" },
		onVerdict: vi.fn(),
	};

	describe("blocking=false (default)", () => {
		it("does not render a Pause button in the toolbar", () => {
			render(<ReviewHeader {...baseProps} />);
			expect(screen.queryByRole("button", { name: /^pause$/i })).toBeNull();
		});
	});

	describe("blocking=true", () => {
		it("renders Pause button in the verdict toolbar", () => {
			render(<ReviewHeader {...baseProps} blocking={true} />);
			const toolbar = screen.getByRole("toolbar", { name: /verdict/i });
			const pause = screen.getByRole("button", { name: /^pause$/i });
			expect(toolbar.contains(pause)).toBe(true);
		});

		it("keeps the three required verdicts always visible", () => {
			render(<ReviewHeader {...baseProps} blocking={true} />);
			expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
			expect(screen.getByRole("button", { name: "Request changes" })).toBeInTheDocument();
			expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
		});

		it("calls onVerdict with 'pause' when Pause is clicked", async () => {
			const user = userEvent.setup();
			const handleVerdict = vi.fn();
			render(<ReviewHeader {...baseProps} onVerdict={handleVerdict} blocking={true} />);
			await user.click(screen.getByRole("button", { name: /^pause$/i }));
			expect(handleVerdict).toHaveBeenCalledWith("pause");
		});
	});
});
