import { ThreadRow } from "@hyperidle/design-system";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

describe("ThreadRow", () => {
	const defaultProps = {
		avatarUrl: "https://example.com/avatar.png",
		title: "Deploy pipeline stuck",
		snippet: "The CI build has been hanging for 20 minutes...",
		timestamp: "2 min ago",
	};

	it("renders avatar image with correct src", () => {
		render(<ThreadRow {...defaultProps} />);
		// @lore I6: avatar uses alt="" (decorative), so use presentation role
		const img = screen.getByRole("presentation");
		expect(img).toHaveAttribute("src", defaultProps.avatarUrl);
	});

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

	it("does not render Tag when tag is omitted", () => {
		const { container } = render(<ThreadRow {...defaultProps} />);
		// Tags use bg-[var(--surface-ghost)]; none should be present when no tag is given
		const tags = container.querySelectorAll("[class*='bg-\\[var\\(--surface-ghost\\)\\]']");
		expect(tags.length).toBe(0);
	});

	it("renders actions slot content", () => {
		render(<ThreadRow {...defaultProps} actions={<button type="button">Reply</button>} />);
		expect(screen.getByText("Reply")).toBeInTheDocument();
	});

	it("applies unread styling when unread is true", () => {
		const { container } = render(<ThreadRow {...defaultProps} unread={true} />);
		const root = container.firstElementChild;
		expect(root).toHaveClass("font-bold");
	});

	it("does not apply unread styling when unread is false", () => {
		const { container } = render(<ThreadRow {...defaultProps} unread={false} />);
		const root = container.firstElementChild;
		expect(root).not.toHaveClass("font-bold");
	});

	it("composes at least 2 Tier 1 primitives (StatusChip + Tag)", () => {
		render(<ThreadRow {...defaultProps} status="healthy" tag="ops" />);
		// StatusChip renders uppercase status text with rounded-full
		expect(screen.getByText("HEALTHY")).toHaveClass("inline-flex", "rounded-full");
		// Tag renders label with rounded-[var(--r2)] and neutral bg
		expect(screen.getByText("ops")).toHaveClass("inline-flex", "rounded-[var(--r2)]");
	});

	it("calls onClick when row is clicked", () => {
		const handleClick = vi.fn();
		render(<ThreadRow {...defaultProps} onClick={handleClick} />);
		const row =
			screen.getByText("Deploy pipeline stuck").closest("[role='button']") ??
			screen.getByText("Deploy pipeline stuck").parentElement;
		row?.click();
		expect(handleClick).toHaveBeenCalledOnce();
	});

	it("applies border-[var(--danger)] when blocking is true", () => {
		const { container } = render(<ThreadRow {...defaultProps} blocking={true} />);
		const root = container.firstElementChild;
		expect(root?.className).toContain("border-[var(--danger)]");
	});

	it("does not apply border-[var(--danger)] when blocking is false", () => {
		const { container } = render(<ThreadRow {...defaultProps} blocking={false} />);
		const root = container.firstElementChild;
		expect(root?.className).not.toContain("border-[var(--danger)]");
	});

	it("renders kind as Tag when provided", () => {
		render(<ThreadRow {...defaultProps} kind="review" />);
		expect(screen.getByText("review")).toHaveClass("inline-flex", "rounded-[var(--r2)]");
	});

	it("renders chat kind as Tag", () => {
		render(<ThreadRow {...defaultProps} kind="chat" />);
		expect(screen.getByText("chat")).toHaveClass("inline-flex", "rounded-[var(--r2)]");
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

	it("selected state stacks with blocking — primary border-left wins", () => {
		const { container } = render(<ThreadRow {...defaultProps} blocking={true} selected={true} />);
		const root = container.firstElementChild;
		// Selected applies a primary border-left; blocking applies a danger border-left.
		// When both are true, the selected primary border must win.
		expect(root?.className).toContain("border-[var(--primary)]");
	});
});
