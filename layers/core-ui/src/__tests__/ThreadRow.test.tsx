import { ThreadRow } from "@hyperidle/design-system";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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

	it("renders unread dot (green) when unread is true", () => {
		render(<ThreadRow {...defaultProps} unread={true} />);
		const dot = screen.getByTestId("unread-dot");
		expect(dot).toBeInTheDocument();
		expect(dot.className).toContain("accent-primary");
	});

	it("renders transparent spacer dot when unread is false", () => {
		render(<ThreadRow {...defaultProps} unread={false} />);
		const spacer = screen.getByTestId("read-dot-spacer");
		expect(spacer).toBeInTheDocument();
		expect(spacer.className).toContain("bg-transparent");
	});

	it("renders transparent spacer dot by default (unread omitted)", () => {
		render(<ThreadRow {...defaultProps} />);
		const spacer = screen.getByTestId("read-dot-spacer");
		expect(spacer).toBeInTheDocument();
	});

	it("applies font-[600] weight on title when unread is true", () => {
		render(<ThreadRow {...defaultProps} unread={true} />);
		const titleEl = screen.getByLabelText("Thread: Deploy pipeline stuck");
		expect(titleEl.className).toContain("font-[600]");
	});

	it("applies font-[400] weight on title when unread is false", () => {
		render(<ThreadRow {...defaultProps} unread={false} />);
		const titleEl = screen.getByLabelText("Thread: Deploy pipeline stuck");
		expect(titleEl.className).toContain("font-[400]");
	});

	it("renders preview with text-secondary color when unread", () => {
		const { container } = render(<ThreadRow {...defaultProps} unread={true} />);
		const preview = container.querySelector("p");
		expect(preview?.className).toContain("text-secondary");
	});

	it("renders preview with text-tertiary color when read", () => {
		const { container } = render(<ThreadRow {...defaultProps} unread={false} />);
		const preview = container.querySelector("p");
		expect(preview?.className).toContain("text-tertiary");
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

	it("blocking badge has red-tinted styling", () => {
		render(<ThreadRow {...defaultProps} blocking={true} />);
		const badge = screen.getByTestId("thread-row-blocking-badge");
		// Uses color-mix for error tint (avoids hardcoded rgba per design/no-hardcoded-color rule)
		expect(badge.className).toContain("status-error");
	});

	it("applies border-[var(--status-error)] on the row when blocking is true", () => {
		const { container } = render(<ThreadRow {...defaultProps} blocking={true} />);
		const root = container.firstElementChild;
		expect(root?.className).toContain("border-[var(--status-error)]");
	});

	it("does not apply border-[var(--status-error)] when blocking is false", () => {
		const { container } = render(<ThreadRow {...defaultProps} blocking={false} />);
		const root = container.firstElementChild;
		expect(root?.className).not.toContain("border-[var(--status-error)]");
	});

	it("renders kind as Tag when provided", () => {
		render(<ThreadRow {...defaultProps} kind="review" />);
		expect(screen.getByText("review")).toHaveClass("inline-flex", "rounded-[var(--r-pill)]");
	});

	it("renders chat kind as Tag", () => {
		render(<ThreadRow {...defaultProps} kind="chat" />);
		expect(screen.getByText("chat")).toHaveClass("inline-flex", "rounded-[var(--r-pill)]");
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
		render(<ThreadRow {...defaultProps} hostTag="bet" />);
		expect(screen.getByText("bet")).toBeInTheDocument();
	});

	it("selected state stacks with blocking — accent-primary border-left wins", () => {
		const { container } = render(<ThreadRow {...defaultProps} blocking={true} selected={true} />);
		const root = container.firstElementChild;
		// Selected applies an accent-primary border-left; blocking applies a status-error border-left.
		// When both are true, the selected accent-primary border must win.
		expect(root?.className).toContain("border-[var(--accent-deep)]");
	});

	it("has border-bottom divider between rows", () => {
		const { container } = render(<ThreadRow {...defaultProps} />);
		const root = container.firstElementChild;
		expect(root?.className).toContain("border-b");
		expect(root?.className).toContain("border-subtle");
	});

	it("does not have border-radius on the row (border-bottom layout, not card layout)", () => {
		const { container } = render(<ThreadRow {...defaultProps} />);
		const root = container.firstElementChild;
		// Rows use border-bottom dividers, not rounded card style
		expect(root?.className).not.toContain("rounded-[var(--r-subtle)]");
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

	it("count badge is green-tinted when unread", () => {
		render(<ThreadRow {...defaultProps} unread={true} messageCount={5} />);
		const badge = screen.getByTestId("thread-row-count-badge");
		expect(badge.className).toContain("accent-primary");
	});

	it("count badge is neutral when read", () => {
		render(<ThreadRow {...defaultProps} unread={false} messageCount={3} />);
		const badge = screen.getByTestId("thread-row-count-badge");
		expect(badge.className).toContain("surface-container");
	});

	it("does not render count badge when messageCount is not provided", () => {
		render(<ThreadRow {...defaultProps} />);
		expect(screen.queryByTestId("thread-row-count-badge")).not.toBeInTheDocument();
	});

	it("composes at least 2 Tier 1 primitives (StatusChip + Tag)", () => {
		render(<ThreadRow {...defaultProps} status="healthy" tag="ops" />);
		// StatusChip renders uppercase status text with rounded-full
		expect(screen.getByText("HEALTHY")).toHaveClass("inline-flex", "rounded-full");
		// Tag renders label with rounded-[var(--r-pill)] and neutral bg
		expect(screen.getByText("ops")).toHaveClass("inline-flex", "rounded-[var(--r-pill)]");
	});

	// Legacy avatarUrl prop — kept for backwards compatibility but not rendered visually
	it("accepts avatarUrl prop without error (backwards compat)", () => {
		expect(() =>
			render(<ThreadRow {...defaultProps} avatarUrl="https://example.com/avatar.png" />),
		).not.toThrow();
	});
});
