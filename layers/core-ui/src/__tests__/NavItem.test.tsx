import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NavItem } from "../ds";

describe("NavItem", () => {
	it("renders the label inside a li > button structure", () => {
		render(<NavItem label="Settings" />);
		const btn = screen.getByRole("button", { name: /Settings/ });
		expect(btn.parentElement?.tagName).toBe("LI");
	});

	it("shows a count badge, including zero, only when count is provided", () => {
		const { rerender } = render(<NavItem label="Tasks" count={5} />);
		expect(screen.getByText("5")).toBeInTheDocument();

		rerender(<NavItem label="Tasks" count={0} />);
		expect(screen.getByText("0")).toBeInTheDocument();

		rerender(<NavItem label="Tasks" />);
		expect(screen.queryByText("0")).not.toBeInTheDocument();
	});

	it("shows the status dot only when statusDot is provided", () => {
		const { rerender } = render(<NavItem label="Dashboard" statusDot="success" />);
		expect(screen.getByTestId("nav-item-status-dot")).toBeInTheDocument();

		rerender(<NavItem label="Dashboard" />);
		expect(screen.queryByTestId("nav-item-status-dot")).not.toBeInTheDocument();
	});

	it("calls onClick when clicked", async () => {
		const user = userEvent.setup();
		const handleClick = vi.fn();
		render(<NavItem label="Click Me" onClick={handleClick} />);
		await user.click(screen.getByRole("button", { name: /Click Me/ }));
		expect(handleClick).toHaveBeenCalledOnce();
	});

	it("does not throw when clicked without an onClick handler", async () => {
		const user = userEvent.setup();
		render(<NavItem label="No handler" />);
		await user.click(screen.getByRole("button", { name: /No handler/ }));
	});

	it("renders as a real button element, not an anchor", () => {
		render(<NavItem label="Click Me" />);
		const btn = screen.getByRole("button", { name: /Click Me/ });
		expect(btn.tagName).toBe("BUTTON");
	});

	it("renders an icon when provided", () => {
		render(<NavItem label="Home" icon={<svg data-testid="icon" />} />);
		expect(screen.getByTestId("icon")).toBeInTheDocument();
	});

	it("renders a label with special characters verbatim", () => {
		render(<NavItem label="Review & Approve (3)" />);
		expect(screen.getByText("Review & Approve (3)")).toBeInTheDocument();
	});
});
