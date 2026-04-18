import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Submenu } from "../shell/Submenu";

describe("Submenu", () => {
	const defaultProps = {
		title: "Conversations",
		collapsed: false,
		onToggleCollapse: vi.fn(),
	};

	describe("expanded state", () => {
		it("renders the title", () => {
			render(<Submenu {...defaultProps}>Content</Submenu>);
			expect(screen.getByText("Conversations")).toBeInTheDocument();
		});

		it("renders children content", () => {
			render(
				<Submenu {...defaultProps}>
					<div>Child item</div>
				</Submenu>,
			);
			expect(screen.getByText("Child item")).toBeInTheDocument();
		});

		it("renders nested items within children", () => {
			render(
				<Submenu {...defaultProps}>
					<ul>
						<li>Item 1</li>
						<li>Item 2</li>
						<li>Item 3</li>
					</ul>
				</Submenu>,
			);
			expect(screen.getByText("Item 1")).toBeInTheDocument();
			expect(screen.getByText("Item 2")).toBeInTheDocument();
			expect(screen.getByText("Item 3")).toBeInTheDocument();
		});

		it("renders a collapse toggle button", () => {
			render(<Submenu {...defaultProps}>Content</Submenu>);
			expect(screen.getByRole("button", { name: /collapse|toggle/i })).toBeInTheDocument();
		});

		it("calls onToggleCollapse when toggle button is clicked", async () => {
			const user = userEvent.setup();
			const handleToggle = vi.fn();
			render(
				<Submenu {...defaultProps} onToggleCollapse={handleToggle}>
					Content
				</Submenu>,
			);
			await user.click(screen.getByRole("button", { name: /collapse|toggle/i }));
			expect(handleToggle).toHaveBeenCalledOnce();
		});
	});

	describe("collapsed state", () => {
		it("does not render children when collapsed", () => {
			render(
				<Submenu {...defaultProps} collapsed>
					<div data-testid="child">Child content</div>
				</Submenu>,
			);
			expect(screen.queryByTestId("child")).not.toBeInTheDocument();
		});

		it("still renders an expand toggle button when collapsed", () => {
			render(
				<Submenu {...defaultProps} collapsed>
					Content
				</Submenu>,
			);
			expect(screen.getByRole("button", { name: /expand|toggle/i })).toBeInTheDocument();
		});

		it("calls onToggleCollapse when expand button is clicked", async () => {
			const user = userEvent.setup();
			const handleToggle = vi.fn();
			render(
				<Submenu {...defaultProps} collapsed onToggleCollapse={handleToggle}>
					Content
				</Submenu>,
			);
			await user.click(screen.getByRole("button", { name: /expand|toggle/i }));
			expect(handleToggle).toHaveBeenCalledOnce();
		});
	});

	describe("search field", () => {
		it("renders SearchField when searchValue and onSearchChange are provided", () => {
			render(
				<Submenu {...defaultProps} searchValue="" onSearchChange={vi.fn()}>
					Content
				</Submenu>,
			);
			expect(screen.getByRole("textbox")).toBeInTheDocument();
		});

		it("does not render SearchField when searchValue is not provided", () => {
			render(<Submenu {...defaultProps}>Content</Submenu>);
			expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
		});

		it("calls onSearchChange when typing in search", async () => {
			const user = userEvent.setup();
			const handleSearch = vi.fn();
			render(
				<Submenu {...defaultProps} searchValue="" onSearchChange={handleSearch}>
					Content
				</Submenu>,
			);
			await user.type(screen.getByRole("textbox"), "test");
			expect(handleSearch).toHaveBeenCalled();
		});
	});

	describe("keyboard navigation", () => {
		it("Escape calls onToggleCollapse when expanded", async () => {
			const user = userEvent.setup();
			const handleToggle = vi.fn();
			render(
				<Submenu {...defaultProps} onToggleCollapse={handleToggle}>
					<button type="button">Focusable child</button>
				</Submenu>,
			);
			const child = screen.getByText("Focusable child");
			child.focus();
			await user.keyboard("{Escape}");
			expect(handleToggle).toHaveBeenCalledOnce();
		});

		it("Escape does not call onToggleCollapse when already collapsed", async () => {
			const user = userEvent.setup();
			const handleToggle = vi.fn();
			render(
				<Submenu {...defaultProps} collapsed onToggleCollapse={handleToggle}>
					Content
				</Submenu>,
			);
			const toggleButton = screen.getByRole("button", { name: /expand|toggle/i });
			toggleButton.focus();
			await user.keyboard("{Escape}");
			// Should not call toggle when already collapsed
			expect(handleToggle).not.toHaveBeenCalled();
		});
	});

	describe("active highlight", () => {
		it("highlights the active child item via children props", () => {
			render(
				<Submenu {...defaultProps}>
					<div data-testid="item" className="active">
						Active item
					</div>
				</Submenu>,
			);
			expect(screen.getByTestId("item")).toHaveClass("active");
		});
	});
});
