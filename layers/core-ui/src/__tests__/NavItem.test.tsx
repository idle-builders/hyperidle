import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NavItem } from "../ds";

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

	it("does not show count pill when count is not provided", () => {
		const { container } = render(<NavItem label="Tasks" />);
		// The count pill uses min-w-[18px] with accent-primary color; check for its absence.
		const pills = container.querySelectorAll("[class*='min-w-[18px]']");
		expect(pills.length).toBe(0);
	});

	it("shows count badge with zero when count is 0", () => {
		render(<NavItem label="Tasks" count={0} />);
		expect(screen.getByText("0")).toBeInTheDocument();
	});

	it("applies selected styles when selected", () => {
		render(<NavItem label="Active" selected />);
		const btn = screen.getByRole("button", { name: /Active/ });
		// Active state: surface-elevated bg + shadow-subtle — no left border accent (matches HTML reference)
		expect(btn.className).toContain("bg-[var(--surface-elevated)]");
		expect(btn.className).toContain("shadow-[var(--shadow-subtle)]");
		expect(btn).not.toHaveClass("border-l-2");
	});

	it("does not apply selected styles when not selected", () => {
		render(<NavItem label="Inactive" />);
		const btn = screen.getByRole("button", { name: /Inactive/ });
		expect(btn).not.toHaveClass("bg-[var(--surface-elevated)]");
	});

	it("renders statusDot with success color when statusDot='success'", () => {
		const { container } = render(<NavItem label="Dashboard" statusDot="success" />);
		const dot = container.querySelector("[class*='bg-[var(--status-success)]']");
		expect(dot).toBeInTheDocument();
	});

	it("renders statusDot with warning color when statusDot='warning'", () => {
		const { container } = render(<NavItem label="Dashboard" statusDot="warning" />);
		const dot = container.querySelector("[class*='bg-[var(--status-warning)]']");
		expect(dot).toBeInTheDocument();
	});

	it("renders statusDot with error color when statusDot='error'", () => {
		const { container } = render(<NavItem label="Dashboard" statusDot="error" />);
		const dot = container.querySelector("[class*='bg-[var(--status-error)]']");
		expect(dot).toBeInTheDocument();
	});

	it("renders statusDot with info color when statusDot='info'", () => {
		const { container } = render(<NavItem label="Dashboard" statusDot="info" />);
		const dot = container.querySelector("[class*='bg-[var(--status-info)]']");
		expect(dot).toBeInTheDocument();
	});

	it("does not render statusDot when statusDot prop is not provided", () => {
		const { container } = render(<NavItem label="Dashboard" />);
		const dot = container.querySelector("[class*='status-']");
		expect(dot).not.toBeInTheDocument();
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
