import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NavItem } from "../components/NavItem";

describe("NavItem", () => {
	it("renders label text", () => {
		render(<NavItem label="Dashboard" />);
		expect(screen.getByText("Dashboard")).toBeInTheDocument();
	});

	it("renders as li > a structure", () => {
		render(<NavItem label="Settings" />);
		const link = screen.getByRole("link", { name: /Settings/ });
		expect(link).toBeInTheDocument();
		expect(link.parentElement?.tagName).toBe("LI");
	});

	it("shows count badge when count is provided", () => {
		render(<NavItem label="Tasks" count={5} />);
		expect(screen.getByText("5")).toBeInTheDocument();
	});

	it("does not show count badge when count is not provided", () => {
		const { container } = render(<NavItem label="Tasks" />);
		const badges = container.querySelectorAll(".badge");
		expect(badges.length).toBe(0);
	});

	it("shows count badge with zero when count is 0", () => {
		render(<NavItem label="Tasks" count={0} />);
		expect(screen.getByText("0")).toBeInTheDocument();
	});

	it("applies selected styles when selected", () => {
		render(<NavItem label="Active" selected />);
		const link = screen.getByRole("link", { name: /Active/ });
		expect(link).toHaveClass("bg-[var(--surface-4)]");
		expect(link).toHaveClass("border-l-2");
		expect(link).toHaveClass("border-primary");
	});

	it("does not apply selected styles when not selected", () => {
		render(<NavItem label="Inactive" />);
		const link = screen.getByRole("link", { name: /Inactive/ });
		expect(link).not.toHaveClass("bg-[var(--surface-4)]");
	});

	it("calls onClick when clicked", async () => {
		const user = userEvent.setup();
		const handleClick = vi.fn();
		render(<NavItem label="Click Me" onClick={handleClick} />);
		await user.click(screen.getByRole("link", { name: /Click Me/ }));
		expect(handleClick).toHaveBeenCalledOnce();
	});

	it("prevents default anchor navigation on click", async () => {
		const user = userEvent.setup();
		render(<NavItem label="Click Me" />);
		const link = screen.getByRole("link", { name: /Click Me/ });
		// The href should remain "#" (no page navigation)
		expect(link).toHaveAttribute("href", "#");
		await user.click(link);
		// Page should still be at the same location (no navigation error)
	});

	it("renders icon when provided", () => {
		render(<NavItem label="Home" icon={<svg data-testid="icon" />} />);
		expect(screen.getByTestId("icon")).toBeInTheDocument();
	});

	it("handles missing onClick gracefully on click", async () => {
		const user = userEvent.setup();
		render(<NavItem label="No handler" />);
		// Should not throw when clicked without an onClick handler
		await user.click(screen.getByRole("link", { name: /No handler/ }));
	});

	it("renders label with special characters", () => {
		render(<NavItem label="Review & Approve (3)" />);
		expect(screen.getByText("Review & Approve (3)")).toBeInTheDocument();
	});

	it("renders empty label without crashing", () => {
		render(<NavItem label="" />);
		// Should render the li structure
		const li = document.querySelector("li");
		expect(li).toBeInTheDocument();
	});
});
