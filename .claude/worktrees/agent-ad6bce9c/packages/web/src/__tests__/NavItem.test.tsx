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

	it("renders icon when provided", () => {
		render(<NavItem label="Home" icon={<svg data-testid="icon" />} />);
		expect(screen.getByTestId("icon")).toBeInTheDocument();
	});
});
