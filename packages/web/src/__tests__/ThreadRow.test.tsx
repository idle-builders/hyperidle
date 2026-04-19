import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ThreadRow } from "../components/ThreadRow";

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
		const badges = container.querySelectorAll(".badge-neutral");
		expect(badges.length).toBe(0);
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
		// StatusChip renders uppercase status text with badge class
		expect(screen.getByText("HEALTHY")).toHaveClass("badge");
		// Tag renders label with badge-neutral class
		expect(screen.getByText("ops")).toHaveClass("badge-neutral");
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

	it("applies border-error when blocking is true", () => {
		const { container } = render(<ThreadRow {...defaultProps} blocking={true} />);
		const root = container.firstElementChild;
		expect(root).toHaveClass("border-error");
	});

	it("does not apply border-error when blocking is false", () => {
		const { container } = render(<ThreadRow {...defaultProps} blocking={false} />);
		const root = container.firstElementChild;
		expect(root).not.toHaveClass("border-error");
	});

	it("renders kind as Tag when provided", () => {
		render(<ThreadRow {...defaultProps} kind="review" />);
		expect(screen.getByText("review")).toHaveClass("badge-neutral");
	});

	it("renders chat kind as Tag", () => {
		render(<ThreadRow {...defaultProps} kind="chat" />);
		expect(screen.getByText("chat")).toHaveClass("badge-neutral");
	});

	it("has aria-label on title", () => {
		render(<ThreadRow {...defaultProps} />);
		expect(screen.getByLabelText("Thread: Deploy pipeline stuck")).toBeInTheDocument();
	});
});
