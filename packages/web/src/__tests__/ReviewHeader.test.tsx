import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ReviewHeader } from "../shell/ReviewHeader";

describe("ReviewHeader", () => {
	const defaultProps = {
		proposer: {
			name: "Agent-Alpha",
			avatarUrl: "https://example.com/avatar.png",
			timestamp: "2 hours ago",
		},
		onVerdict: vi.fn(),
	};

	describe("proposer info", () => {
		it("renders the proposer name", () => {
			render(<ReviewHeader {...defaultProps} />);
			expect(screen.getByText("Agent-Alpha")).toBeInTheDocument();
		});

		it("renders the proposer avatar", () => {
			render(<ReviewHeader {...defaultProps} />);
			const img = screen.getByAltText(/agent-alpha/i);
			expect(img).toHaveAttribute("src", "https://example.com/avatar.png");
		});

		it("renders the timestamp", () => {
			render(<ReviewHeader {...defaultProps} />);
			expect(screen.getByText("2 hours ago")).toBeInTheDocument();
		});

		it("renders a fallback avatar when no URL provided", () => {
			render(
				<ReviewHeader
					{...defaultProps}
					proposer={{ name: "Agent-Beta", timestamp: "1 min ago" }}
				/>,
			);
			expect(screen.getByText("Agent-Beta")).toBeInTheDocument();
			// Should render placeholder avatar, not crash
			expect(screen.queryByAltText(/agent-beta/i)).not.toBeInTheDocument();
		});
	});

	describe("verdict buttons", () => {
		it("renders all 10 verdict buttons", () => {
			render(<ReviewHeader {...defaultProps} />);
			const buttons = screen.getAllByRole("button");
			// At least 10 verdict buttons (may include others)
			expect(buttons.length).toBeGreaterThanOrEqual(10);
		});

		it("renders a button for each of the 10 verdicts", () => {
			render(<ReviewHeader {...defaultProps} />);
			// Use exact aria-label matches to avoid substring collisions
			const labels = [
				"Approve",
				"Approve with comments",
				"Comment",
				"Inline comment",
				"Request changes",
				"Edit",
				"Reject",
				"Reply",
				"Snooze",
				"Escalate",
			];
			for (const label of labels) {
				expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
			}
		});

		it("calls onVerdict with the correct action when a button is clicked", async () => {
			const user = userEvent.setup();
			const handleVerdict = vi.fn();
			render(<ReviewHeader {...defaultProps} onVerdict={handleVerdict} />);
			await user.click(screen.getByRole("button", { name: "Approve" }));
			expect(handleVerdict).toHaveBeenCalledWith("approve");
		});

		it("calls onVerdict with 'reject' when reject button clicked", async () => {
			const user = userEvent.setup();
			const handleVerdict = vi.fn();
			render(<ReviewHeader {...defaultProps} onVerdict={handleVerdict} />);
			await user.click(screen.getByRole("button", { name: "Reject" }));
			expect(handleVerdict).toHaveBeenCalledWith("reject");
		});
	});

	describe("keyboard shortcuts", () => {
		it("A key triggers approve verdict", async () => {
			const user = userEvent.setup();
			const handleVerdict = vi.fn();
			render(<ReviewHeader {...defaultProps} onVerdict={handleVerdict} />);
			await user.keyboard("a");
			expect(handleVerdict).toHaveBeenCalledWith("approve");
		});

		it("r key triggers request-changes verdict", async () => {
			const user = userEvent.setup();
			const handleVerdict = vi.fn();
			render(<ReviewHeader {...defaultProps} onVerdict={handleVerdict} />);
			await user.keyboard("r");
			expect(handleVerdict).toHaveBeenCalledWith("request-changes");
		});

		it("x key triggers reject verdict", async () => {
			const user = userEvent.setup();
			const handleVerdict = vi.fn();
			render(<ReviewHeader {...defaultProps} onVerdict={handleVerdict} />);
			await user.keyboard("x");
			expect(handleVerdict).toHaveBeenCalledWith("reject");
		});

		it("s key triggers snooze verdict", async () => {
			const user = userEvent.setup();
			const handleVerdict = vi.fn();
			render(<ReviewHeader {...defaultProps} onVerdict={handleVerdict} />);
			await user.keyboard("s");
			expect(handleVerdict).toHaveBeenCalledWith("snooze");
		});

		it("does not fire shortcuts when input is focused", async () => {
			const user = userEvent.setup();
			const handleVerdict = vi.fn();
			render(
				<div>
					<input type="text" data-testid="input" />
					<ReviewHeader {...defaultProps} onVerdict={handleVerdict} />
				</div>,
			);
			const input = screen.getByTestId("input");
			await user.click(input);
			await user.keyboard("a");
			expect(handleVerdict).not.toHaveBeenCalled();
		});
	});

	describe("keyboard shortcut hints", () => {
		it("shows keyboard shortcut hint on approve button", () => {
			render(<ReviewHeader {...defaultProps} />);
			const approveBtn = screen.getByRole("button", { name: "Approve" });
			expect(approveBtn).toHaveAttribute("title", expect.stringContaining("A"));
		});
	});

	describe("accessibility", () => {
		it("has a toolbar role with accessible label", () => {
			render(<ReviewHeader {...defaultProps} />);
			expect(screen.getByRole("toolbar", { name: /verdict/i })).toBeInTheDocument();
		});
	});
});
