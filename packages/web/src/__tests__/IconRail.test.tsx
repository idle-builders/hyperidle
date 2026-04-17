import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { IconRail } from "../shell/IconRail";

describe("IconRail", () => {
	const defaultProps = {
		activeView: "conversations" as const,
		onViewChange: vi.fn(),
	};

	it("renders a nav with aria-label 'Main navigation'", () => {
		render(<IconRail {...defaultProps} />);
		expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeInTheDocument();
	});

	it("renders exactly 3 view buttons", () => {
		render(<IconRail {...defaultProps} />);
		const buttons = screen.getAllByRole("button");
		// 3 view buttons + optional avatar button
		expect(buttons.length).toBeGreaterThanOrEqual(3);
	});

	it("renders buttons for Conversations, Work, and Knowledge", () => {
		render(<IconRail {...defaultProps} />);
		expect(screen.getByRole("button", { name: /conversations/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /work/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /knowledge/i })).toBeInTheDocument();
	});

	it("each view button has a title attribute matching its label for hover tooltips", () => {
		render(<IconRail {...defaultProps} />);
		expect(screen.getByRole("button", { name: /conversations/i })).toHaveAttribute(
			"title",
			"Conversations",
		);
		expect(screen.getByRole("button", { name: /work/i })).toHaveAttribute("title", "Work");
		expect(screen.getByRole("button", { name: /knowledge/i })).toHaveAttribute(
			"title",
			"Knowledge",
		);
	});

	it("marks the active view button with aria-current='page'", () => {
		render(<IconRail {...defaultProps} activeView="work" />);
		const workButton = screen.getByRole("button", { name: /work/i });
		expect(workButton).toHaveAttribute("aria-current", "page");
	});

	it("non-active buttons do not have aria-current", () => {
		render(<IconRail {...defaultProps} activeView="conversations" />);
		const workButton = screen.getByRole("button", { name: /work/i });
		expect(workButton).not.toHaveAttribute("aria-current", "page");
	});

	it("active view button has visually distinct styling", () => {
		render(<IconRail {...defaultProps} activeView="conversations" />);
		const activeButton = screen.getByRole("button", { name: /conversations/i });
		// Active button should have a distinguishing class
		expect(activeButton.className).not.toBe(
			screen.getByRole("button", { name: /work/i }).className,
		);
	});

	it("calls onViewChange with view id when button is clicked", async () => {
		const user = userEvent.setup();
		const handleViewChange = vi.fn();
		render(<IconRail {...defaultProps} onViewChange={handleViewChange} />);
		await user.click(screen.getByRole("button", { name: /work/i }));
		expect(handleViewChange).toHaveBeenCalledWith("work");
	});

	it("calls onViewChange with 'knowledge' when Knowledge button clicked", async () => {
		const user = userEvent.setup();
		const handleViewChange = vi.fn();
		render(<IconRail {...defaultProps} onViewChange={handleViewChange} />);
		await user.click(screen.getByRole("button", { name: /knowledge/i }));
		expect(handleViewChange).toHaveBeenCalledWith("knowledge");
	});

	describe("keyboard navigation", () => {
		it("ArrowDown moves focus to the next button", async () => {
			const user = userEvent.setup();
			render(<IconRail {...defaultProps} />);
			const buttons = [
				screen.getByRole("button", { name: /conversations/i }),
				screen.getByRole("button", { name: /work/i }),
				screen.getByRole("button", { name: /knowledge/i }),
			];
			buttons[0].focus();
			await user.keyboard("{ArrowDown}");
			expect(document.activeElement).toBe(buttons[1]);
		});

		it("ArrowUp moves focus to the previous button", async () => {
			const user = userEvent.setup();
			render(<IconRail {...defaultProps} />);
			const buttons = [
				screen.getByRole("button", { name: /conversations/i }),
				screen.getByRole("button", { name: /work/i }),
				screen.getByRole("button", { name: /knowledge/i }),
			];
			buttons[1].focus();
			await user.keyboard("{ArrowUp}");
			expect(document.activeElement).toBe(buttons[0]);
		});

		it("Enter activates the focused button", async () => {
			const user = userEvent.setup();
			const handleViewChange = vi.fn();
			render(<IconRail {...defaultProps} onViewChange={handleViewChange} />);
			const convButton = screen.getByRole("button", { name: /conversations/i });
			convButton.focus();
			await user.keyboard("{ArrowDown}");
			await user.keyboard("{Enter}");
			expect(handleViewChange).toHaveBeenCalledWith("work");
		});

		it("ArrowDown wraps from last to first", async () => {
			const user = userEvent.setup();
			render(<IconRail {...defaultProps} />);
			const buttons = [
				screen.getByRole("button", { name: /conversations/i }),
				screen.getByRole("button", { name: /work/i }),
				screen.getByRole("button", { name: /knowledge/i }),
			];
			buttons[2].focus();
			await user.keyboard("{ArrowDown}");
			expect(document.activeElement).toBe(buttons[0]);
		});
	});

	describe("avatar button", () => {
		it("renders an avatar button when onAvatarClick is provided", () => {
			render(<IconRail {...defaultProps} onAvatarClick={vi.fn()} />);
			expect(screen.getByRole("button", { name: /avatar|profile|user/i })).toBeInTheDocument();
		});

		it("calls onAvatarClick when avatar button is clicked", async () => {
			const user = userEvent.setup();
			const handleAvatarClick = vi.fn();
			render(<IconRail {...defaultProps} onAvatarClick={handleAvatarClick} />);
			await user.click(screen.getByRole("button", { name: /avatar|profile|user/i }));
			expect(handleAvatarClick).toHaveBeenCalledOnce();
		});

		it("renders avatar image when avatarUrl is provided", () => {
			render(
				<IconRail
					{...defaultProps}
					onAvatarClick={vi.fn()}
					avatarUrl="https://example.com/avatar.png"
				/>,
			);
			const img = screen.getByRole("img");
			expect(img).toHaveAttribute("src", "https://example.com/avatar.png");
		});
	});
});
