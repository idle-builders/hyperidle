import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ReviewHeader } from "../shell/ReviewHeader";

describe("ReviewHeader blocking → Pause button (J4)", () => {
	const baseProps = {
		proposer: { name: "Agent-Alpha", timestamp: "2m ago" },
		onPrefill: vi.fn(),
		onCommit: vi.fn(),
		pendingVerdict: null,
		verdictDoubleClick: false,
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

		it("calls onCommit with 'pause' when Pause is clicked (single-click mode)", async () => {
			const user = userEvent.setup();
			const handleCommit = vi.fn();
			render(<ReviewHeader {...baseProps} onCommit={handleCommit} blocking={true} />);
			await user.click(screen.getByRole("button", { name: /^pause$/i }));
			expect(handleCommit).toHaveBeenCalledWith("pause");
		});
	});
});
