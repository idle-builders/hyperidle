import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NavItem } from "@hyperidle/design-system";

describe("NavItem", () => {
	it("renders label text", () => {
		render(<NavItem label="Dashboard" />);
		expect(screen.getByText("Dashboard")).toBeInTheDocument();
	});

	it("renders as li > button structure", () => {
		render(<NavItem label="Settings" />);
		const btn = screen.getByRole("button", { name: /Settings/ });
		expect(btn).toBeInTheDocument();
		expect(btn.parentElement?.tagName).toBe("LI");
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
		const btn = screen.getByRole("button", { name: /Active/ });
		expect(btn).toHaveClass("bg-[var(--surface-4)]");
		expect(btn).toHaveClass("border-l-2");
		expect(btn).toHaveClass("border-primary");
	});

	it("does not apply selected styles when not selected", () => {
		render(<NavItem label="Inactive" />);
		const btn = screen.getByRole("button", { name: /Inactive/ });
		expect(btn).not.toHaveClass("bg-[var(--surface-4)]");
	});

	it("calls onClick when clicked", async () => {
		const user = userEvent.setup();
		const handleClick = vi.fn();
		render(<NavItem label="Click Me" onClick={handleClick} />);
		await user.click(screen.getByRole("button", { name: /Click Me/ }));
		expect(handleClick).toHaveBeenCalledOnce();
	});

	it("renders as a button element (no anchor navigation)", () => {
		render(<NavItem label="Click Me" />);
		const btn = screen.getByRole("button", { name: /Click Me/ });
		expect(btn.tagName).toBe("BUTTON");
		expect(btn).toHaveAttribute("type", "button");
	});

	it("renders icon when provided", () => {
		render(<NavItem label="Home" icon={<svg data-testid="icon" />} />);
		expect(screen.getByTestId("icon")).toBeInTheDocument();
	});

	it("handles missing onClick gracefully on click", async () => {
		const user = userEvent.setup();
		render(<NavItem label="No handler" />);
		// Should not throw when clicked without an onClick handler
		await user.click(screen.getByRole("button", { name: /No handler/ }));
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
