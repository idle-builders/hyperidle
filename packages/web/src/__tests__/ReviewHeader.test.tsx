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
		it("renders all 10 verdict controls (4 primary buttons + 6 secondary menuitems)", () => {
			render(<ReviewHeader {...defaultProps} />);
			// I4 Design H3: primary verdicts are role=button; secondary
			// verdicts live inside a role=menu as role=menuitem.
			const primary = screen.getAllByRole("button");
			const secondary = screen.getAllByRole("menuitem");
			expect(primary.length).toBeGreaterThanOrEqual(4);
			expect(secondary.length).toBe(6);
			expect(primary.length + secondary.length).toBeGreaterThanOrEqual(10);
		});

		it("renders a control for each of the 10 verdicts", () => {
			render(<ReviewHeader {...defaultProps} />);
			// Primary verdicts keep role=button, secondary verdicts are menuitems.
			const primaryLabels = ["Approve", "Request changes", "Reject", "Snooze"];
			const secondaryLabels = [
				"Approve with comments",
				"Comment",
				"Inline comment",
				"Edit",
				"Reply",
				"Escalate",
			];
			for (const label of primaryLabels) {
				expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
			}
			for (const label of secondaryLabels) {
				expect(screen.getByRole("menuitem", { name: label })).toBeInTheDocument();
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
		it("A key triggers approve verdict when header is focused", async () => {
			const user = userEvent.setup();
			const handleVerdict = vi.fn();
			render(<ReviewHeader {...defaultProps} onVerdict={handleVerdict} />);
			// Shortcuts are scoped to the header — need to focus a child element first
			await user.click(screen.getByRole("button", { name: "Approve" }));
			handleVerdict.mockClear();
			await user.keyboard("a");
			expect(handleVerdict).toHaveBeenCalledWith("approve");
		});

		it("r key triggers request-changes verdict when header is focused", async () => {
			const user = userEvent.setup();
			const handleVerdict = vi.fn();
			render(<ReviewHeader {...defaultProps} onVerdict={handleVerdict} />);
			await user.click(screen.getByRole("button", { name: "Request changes" }));
			handleVerdict.mockClear();
			await user.keyboard("r");
			expect(handleVerdict).toHaveBeenCalledWith("request-changes");
		});

		it("x key triggers reject verdict when header is focused", async () => {
			const user = userEvent.setup();
			const handleVerdict = vi.fn();
			render(<ReviewHeader {...defaultProps} onVerdict={handleVerdict} />);
			await user.click(screen.getByRole("button", { name: "Reject" }));
			handleVerdict.mockClear();
			await user.keyboard("x");
			expect(handleVerdict).toHaveBeenCalledWith("reject");
		});

		it("s key triggers snooze verdict when header is focused", async () => {
			const user = userEvent.setup();
			const handleVerdict = vi.fn();
			render(<ReviewHeader {...defaultProps} onVerdict={handleVerdict} />);
			await user.click(screen.getByRole("button", { name: "Snooze" }));
			handleVerdict.mockClear();
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

		it("shows shortcut in title for each button", () => {
			render(<ReviewHeader {...defaultProps} />);
			const rejectBtn = screen.getByRole("button", { name: "Reject" });
			expect(rejectBtn).toHaveAttribute("title", expect.stringContaining("X"));
			const snoozeBtn = screen.getByRole("button", { name: "Snooze" });
			expect(snoozeBtn).toHaveAttribute("title", expect.stringContaining("S"));
		});

		it("renders kbd elements for each shortcut", () => {
			const { container } = render(<ReviewHeader {...defaultProps} />);
			const kbds = container.querySelectorAll("kbd");
			// Each of the 10 buttons with a shortcut should have a kbd element
			expect(kbds.length).toBeGreaterThanOrEqual(10);
		});
	});

	describe("keyboard shortcut scoping", () => {
		it("does not fire shortcuts when textarea is focused", async () => {
			const user = userEvent.setup();
			const handleVerdict = vi.fn();
			render(
				<div>
					<textarea data-testid="textarea" />
					<ReviewHeader {...defaultProps} onVerdict={handleVerdict} />
				</div>,
			);
			const textarea = screen.getByTestId("textarea");
			await user.click(textarea);
			await user.keyboard("a");
			expect(handleVerdict).not.toHaveBeenCalled();
		});

		it("does not fire shortcuts when select is focused", async () => {
			const user = userEvent.setup();
			const handleVerdict = vi.fn();
			render(
				<div>
					<select data-testid="select">
						<option>a</option>
					</select>
					<ReviewHeader {...defaultProps} onVerdict={handleVerdict} />
				</div>,
			);
			const select = screen.getByTestId("select");
			await user.click(select);
			await user.keyboard("a");
			expect(handleVerdict).not.toHaveBeenCalled();
		});

		it("does not fire for unbound keys", async () => {
			const user = userEvent.setup();
			const handleVerdict = vi.fn();
			render(<ReviewHeader {...defaultProps} onVerdict={handleVerdict} />);
			await user.keyboard("z");
			expect(handleVerdict).not.toHaveBeenCalled();
		});

		it("cleans up keydown listener on unmount", async () => {
			const user = userEvent.setup();
			const handleVerdict = vi.fn();
			const { unmount } = render(<ReviewHeader {...defaultProps} onVerdict={handleVerdict} />);
			unmount();
			await user.keyboard("a");
			expect(handleVerdict).not.toHaveBeenCalled();
		});
	});

	describe("accessibility", () => {
		it("has a toolbar role with accessible label", () => {
			render(<ReviewHeader {...defaultProps} />);
			expect(screen.getByRole("toolbar", { name: /verdict/i })).toBeInTheDocument();
		});

		it("all verdict controls have aria-label matching their display label", () => {
			render(<ReviewHeader {...defaultProps} />);
			const primaryLabels = ["Approve", "Request changes", "Reject", "Snooze"];
			const secondaryLabels = [
				"Approve with comments",
				"Comment",
				"Inline comment",
				"Edit",
				"Reply",
				"Escalate",
			];
			for (const label of primaryLabels) {
				const btn = screen.getByRole("button", { name: label });
				expect(btn).toHaveAttribute("aria-label", label);
			}
			for (const label of secondaryLabels) {
				const item = screen.getByRole("menuitem", { name: label });
				expect(item).toHaveAttribute("aria-label", label);
			}
		});

		it("the overflow trigger advertises the menu via aria-haspopup/aria-controls (Design H3)", () => {
			render(<ReviewHeader {...defaultProps} />);
			const trigger = screen.getByRole("button", { name: /more actions/i });
			expect(trigger).toHaveAttribute("aria-haspopup", "menu");
			expect(trigger).toHaveAttribute("aria-controls");
			expect(trigger).toHaveAttribute("aria-expanded");
		});

		it("secondary menuitems are removed from tab order when the menu is closed (Design H3)", () => {
			render(<ReviewHeader {...defaultProps} />);
			const secondary = screen.getAllByRole("menuitem");
			for (const item of secondary) {
				expect(item).toHaveAttribute("tabindex", "-1");
			}
		});

		it("secondary menuitems enter the tab order when the menu opens (Design H3)", async () => {
			const user = userEvent.setup();
			render(<ReviewHeader {...defaultProps} />);
			await user.click(screen.getByRole("button", { name: /more actions/i }));
			const secondary = screen.getAllByRole("menuitem");
			for (const item of secondary) {
				expect(item).toHaveAttribute("tabindex", "0");
			}
		});
	});

	describe("4 primary verdicts + overflow dropdown (I4 P3)", () => {
		it("the primary toolbar contains exactly 4 verdict buttons", () => {
			// I4 P3: spec — "4 primary verdict buttons (Approve, Request
			// Changes, Reject, Snooze)". The primary toolbar must hold only
			// these; the remaining 6 live in an overflow dropdown.
			render(<ReviewHeader {...defaultProps} />);
			const toolbar = screen.getByRole("toolbar", { name: /verdict/i });
			const primaryButtons = toolbar.querySelectorAll(":scope > button");
			expect(primaryButtons.length).toBe(4);
		});

		it("primary buttons are Approve / Request changes / Reject / Snooze", () => {
			render(<ReviewHeader {...defaultProps} />);
			const toolbar = screen.getByRole("toolbar", { name: /verdict/i });
			const labels = Array.from(toolbar.querySelectorAll(":scope > button")).map((btn) =>
				btn.getAttribute("aria-label"),
			);
			expect(labels).toEqual(
				expect.arrayContaining(["Approve", "Request changes", "Reject", "Snooze"]),
			);
			expect(labels).toHaveLength(4);
		});

		it("secondary verdicts live inside a 'More' overflow control, not the primary toolbar", () => {
			render(<ReviewHeader {...defaultProps} />);
			const moreControl = screen.getByRole("button", { name: /more|overflow|more actions/i });
			expect(moreControl).toBeInTheDocument();
		});

		it("opening the overflow reveals the 6 secondary verdicts", async () => {
			const user = userEvent.setup();
			render(<ReviewHeader {...defaultProps} />);
			const moreControl = screen.getByRole("button", { name: /more|overflow|more actions/i });
			await user.click(moreControl);
			const secondaryLabels = [
				"Approve with comments",
				"Comment",
				"Inline comment",
				"Edit",
				"Reply",
				"Escalate",
			];
			for (const label of secondaryLabels) {
				// The secondary control may be exposed via menuitem or button
				// role depending on the dropdown implementation.
				const byButton = screen.queryByRole("button", { name: label });
				const byMenuItem = screen.queryByRole("menuitem", { name: label });
				expect(byButton ?? byMenuItem).not.toBeNull();
			}
		});

		it("pressing 'c' still fires comment verdict even when dropdown is closed", async () => {
			// I4 P3: keyboard shortcuts are a global listener on the header
			// and must work independently of the dropdown open state.
			const user = userEvent.setup();
			const handleVerdict = vi.fn();
			render(<ReviewHeader {...defaultProps} onVerdict={handleVerdict} />);
			// Focus inside the header via the primary Approve button
			await user.click(screen.getByRole("button", { name: "Approve" }));
			handleVerdict.mockClear();
			await user.keyboard("c");
			expect(handleVerdict).toHaveBeenCalledWith("comment");
		});
	});
});
