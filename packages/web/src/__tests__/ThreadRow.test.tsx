import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
		const img = screen.getByRole("img");
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
});
