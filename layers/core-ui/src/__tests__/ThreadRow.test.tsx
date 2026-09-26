import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ThreadRow } from "../ds";

describe("ThreadRow", () => {
	const defaultProps = {
		title: "Deploy pipeline stuck",
		snippet: "The CI build has been hanging for 20 minutes...",
		timestamp: "2 min ago",
	};

	it("renders title text", () => {
		render(<ThreadRow {...defaultProps} />);
		expect(screen.getByText("Deploy pipeline stuck")).toBeInTheDocument();
	});

	it("renders snippet text", () => {
		render(<ThreadRow {...defaultProps} />);
		expect(screen.getByText(/The CI build has been hanging/)).toBeInTheDocument();
	});

	it("renders timestamp", () => {
		render(<ThreadRow {...defaultProps} />);
		expect(screen.getByText("2 min ago")).toBeInTheDocument();
	});

	it("renders StatusChip when status is provided", () => {
		render(<ThreadRow {...defaultProps} status="blocked" />);
		expect(screen.getByText("BLOCKED")).toBeInTheDocument();
	});

	it("does not render StatusChip when status is omitted", () => {
		render(<ThreadRow {...defaultProps} />);
		expect(screen.queryByText("HEALTHY")).not.toBeInTheDocument();
		expect(screen.queryByText("BLOCKED")).not.toBeInTheDocument();
	});

	it("renders Tag when tag prop is provided", () => {
		render(<ThreadRow {...defaultProps} tag="urgent" />);
		expect(screen.getByText("urgent")).toBeInTheDocument();
	});

	it("renders actions slot content", () => {
		render(<ThreadRow {...defaultProps} actions={<button type="button">Reply</button>} />);
		expect(screen.getByText("Reply")).toBeInTheDocument();
	});

	it("renders an unread dot when unread is true, and a read-state spacer otherwise", () => {
		const { rerender } = render(<ThreadRow {...defaultProps} unread={true} />);
		expect(screen.getByTestId("unread-dot")).toBeInTheDocument();

		rerender(<ThreadRow {...defaultProps} unread={false} />);
		expect(screen.getByTestId("read-dot-spacer")).toBeInTheDocument();

		rerender(<ThreadRow {...defaultProps} />);
		expect(screen.getByTestId("read-dot-spacer")).toBeInTheDocument();
	});

	it("calls onClick when row is clicked", () => {
		const handleClick = vi.fn();
		render(<ThreadRow {...defaultProps} onClick={handleClick} />);
		const row =
			screen.getByText("Deploy pipeline stuck").closest("[role='button']") ??
			screen.getByText("Deploy pipeline stuck").parentElement;
		(row as HTMLElement | null)?.click();
		expect(handleClick).toHaveBeenCalledOnce();
	});

	it("renders blocking badge in meta section when blocking is true", () => {
		render(<ThreadRow {...defaultProps} blocking={true} />);
		const badge = screen.getByTestId("thread-row-blocking-badge");
		expect(badge).toBeInTheDocument();
		expect(badge.textContent).toBe("Blocking");
	});

	it("does not render blocking badge when blocking is false", () => {
		render(<ThreadRow {...defaultProps} blocking={false} />);
		expect(screen.queryByTestId("thread-row-blocking-badge")).not.toBeInTheDocument();
	});

	it("shows a blocking badge only when blocking is true", () => {
		const { rerender } = render(<ThreadRow {...defaultProps} blocking={true} />);
		expect(screen.getByTestId("thread-row-blocking-badge")).toBeInTheDocument();

		rerender(<ThreadRow {...defaultProps} blocking={false} />);
		expect(screen.queryByTestId("thread-row-blocking-badge")).not.toBeInTheDocument();
	});

	it("renders the kind as a Tag label when provided", () => {
		render(<ThreadRow {...defaultProps} kind="review" />);
		expect(screen.getByText("review")).toBeInTheDocument();
	});

	it("renders chat kind as a Tag label", () => {
		render(<ThreadRow {...defaultProps} kind="chat" />);
		expect(screen.getByText("chat")).toBeInTheDocument();
	});

	it("has aria-label on title", () => {
		render(<ThreadRow {...defaultProps} />);
		expect(screen.getByLabelText("Thread: Deploy pipeline stuck")).toBeInTheDocument();
	});

	// L8 — selected / pinned / hostTag props
	it("applies aria-current='true' when selected", () => {
		const { container } = render(<ThreadRow {...defaultProps} selected={true} />);
		const root = container.firstElementChild;
		expect(root).toHaveAttribute("aria-current", "true");
	});

	it("does not apply aria-current when not selected", () => {
		const { container } = render(<ThreadRow {...defaultProps} />);
		const root = container.firstElementChild;
		expect(root).not.toHaveAttribute("aria-current");
	});

	it("renders the pin glyph when pinned is true", () => {
		render(<ThreadRow {...defaultProps} pinned={true} />);
		expect(screen.getByLabelText("Pinned")).toBeInTheDocument();
	});

	it("does not render the pin glyph when pinned is false", () => {
		render(<ThreadRow {...defaultProps} pinned={false} />);
		expect(screen.queryByLabelText("Pinned")).toBeNull();
	});

	it("renders the host tag pill when hostTag is provided", () => {
		// @lore BB1: hostTag="team" renders "team", not "bet" (BC3: "task" host
		// kind is gone — a task's thread is team-hosted).
		render(<ThreadRow {...defaultProps} hostTag="team" />);
		expect(screen.getByText("team")).toBeInTheDocument();
	});

	// Avatar group and count badge
	it("renders overlapping avatar group when avatars prop is provided", () => {
		render(
			<ThreadRow
				{...defaultProps}
				avatars={[{ initials: "TG" }, { initials: "AT", agent: true }]}
			/>,
		);
		// AE5: Avatar spans no longer carry aria-hidden (presence dots inside carry aria-label).
		// Find avatars by their initials text content instead.
		const tgAvatar = screen.getByText("TG");
		const atAvatar = screen.getByText("AT");
		expect(tgAvatar).toBeDefined();
		expect(atAvatar).toBeDefined();
	});

	it("renders message count badge when messageCount is provided", () => {
		render(<ThreadRow {...defaultProps} messageCount={8} />);
		const badge = screen.getByTestId("thread-row-count-badge");
		expect(badge).toBeInTheDocument();
		expect(badge.textContent).toBe("8");
	});

	it("does not render count badge when messageCount is not provided", () => {
		render(<ThreadRow {...defaultProps} />);
		expect(screen.queryByTestId("thread-row-count-badge")).not.toBeInTheDocument();
	});

	it("shows both the status and the tag label together", () => {
		render(<ThreadRow {...defaultProps} status="healthy" tag="ops" />);
		expect(screen.getByText("HEALTHY")).toBeInTheDocument();
		expect(screen.getByText("ops")).toBeInTheDocument();
	});

	// Legacy avatarUrl prop — kept for backwards compatibility but not rendered visually
	it("accepts avatarUrl prop without error (backwards compat)", () => {
		expect(() =>
			render(<ThreadRow {...defaultProps} avatarUrl="https://example.com/avatar.png" />),
		).not.toThrow();
	});
});
