import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useRovingFocus } from "../shell/use-roving-focus";

function TestHarness({
	itemCount,
	onSelect,
	onEscape,
}: {
	itemCount: number;
	onSelect?: (index: number) => void;
	onEscape?: () => void;
}) {
	const { activeIndex, getItemProps } = useRovingFocus({
		itemCount,
		onSelect,
		onEscape,
	});

	return (
		<div>
			<span data-testid="active-index">{activeIndex}</span>
			{Array.from({ length: itemCount }, (_, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: test harness with static items
				<button key={i} type="button" {...getItemProps(i)}>
					Item {i}
				</button>
			))}
		</div>
	);
}

describe("useRovingFocus", () => {
	it("starts with activeIndex 0", () => {
		render(<TestHarness itemCount={3} />);
		expect(screen.getByTestId("active-index").textContent).toBe("0");
	});

	it("only the active item has tabIndex 0, others have -1", () => {
		render(<TestHarness itemCount={3} />);
		const buttons = screen.getAllByRole("button");
		expect(buttons[0]).toHaveAttribute("tabindex", "0");
		expect(buttons[1]).toHaveAttribute("tabindex", "-1");
		expect(buttons[2]).toHaveAttribute("tabindex", "-1");
	});

	it("ArrowDown moves focus to next item", async () => {
		const user = userEvent.setup();
		render(<TestHarness itemCount={3} />);
		const buttons = screen.getAllByRole("button");
		buttons[0].focus();
		await user.keyboard("{ArrowDown}");
		expect(screen.getByTestId("active-index").textContent).toBe("1");
	});

	it("ArrowUp moves focus to previous item", async () => {
		const user = userEvent.setup();
		render(<TestHarness itemCount={3} />);
		const buttons = screen.getAllByRole("button");
		// First move down, then up
		buttons[0].focus();
		await user.keyboard("{ArrowDown}");
		await user.keyboard("{ArrowUp}");
		expect(screen.getByTestId("active-index").textContent).toBe("0");
	});

	it("ArrowDown wraps from last to first", async () => {
		const user = userEvent.setup();
		render(<TestHarness itemCount={3} />);
		const buttons = screen.getAllByRole("button");
		buttons[0].focus();
		await user.keyboard("{ArrowDown}");
		await user.keyboard("{ArrowDown}");
		await user.keyboard("{ArrowDown}");
		expect(screen.getByTestId("active-index").textContent).toBe("0");
	});

	it("ArrowUp wraps from first to last", async () => {
		const user = userEvent.setup();
		render(<TestHarness itemCount={3} />);
		const buttons = screen.getAllByRole("button");
		buttons[0].focus();
		await user.keyboard("{ArrowUp}");
		expect(screen.getByTestId("active-index").textContent).toBe("2");
	});

	it("Enter calls onSelect with current index", async () => {
		const user = userEvent.setup();
		const handleSelect = vi.fn();
		render(<TestHarness itemCount={3} onSelect={handleSelect} />);
		const buttons = screen.getAllByRole("button");
		buttons[0].focus();
		await user.keyboard("{ArrowDown}");
		await user.keyboard("{Enter}");
		expect(handleSelect).toHaveBeenCalledWith(1);
	});

	it("Space calls onSelect with current index", async () => {
		const user = userEvent.setup();
		const handleSelect = vi.fn();
		render(<TestHarness itemCount={3} onSelect={handleSelect} />);
		const buttons = screen.getAllByRole("button");
		buttons[0].focus();
		await user.keyboard(" ");
		expect(handleSelect).toHaveBeenCalledWith(0);
	});

	it("Escape calls onEscape", async () => {
		const user = userEvent.setup();
		const handleEscape = vi.fn();
		render(<TestHarness itemCount={3} onEscape={handleEscape} />);
		const buttons = screen.getAllByRole("button");
		buttons[0].focus();
		await user.keyboard("{Escape}");
		expect(handleEscape).toHaveBeenCalledOnce();
	});

	it("does not call onEscape when not provided", async () => {
		const user = userEvent.setup();
		render(<TestHarness itemCount={3} />);
		const buttons = screen.getAllByRole("button");
		buttons[0].focus();
		// Should not throw
		await user.keyboard("{Escape}");
		expect(screen.getByTestId("active-index").textContent).toBe("0");
	});

	it("moves DOM focus to the active item on arrow key", async () => {
		const user = userEvent.setup();
		render(<TestHarness itemCount={3} />);
		const buttons = screen.getAllByRole("button");
		buttons[0].focus();
		await user.keyboard("{ArrowDown}");
		expect(document.activeElement).toBe(buttons[1]);
	});

	it("handles itemCount of 1 without error", async () => {
		const user = userEvent.setup();
		render(<TestHarness itemCount={1} />);
		const buttons = screen.getAllByRole("button");
		buttons[0].focus();
		await user.keyboard("{ArrowDown}");
		expect(screen.getByTestId("active-index").textContent).toBe("0");
	});

	it("Home key jumps focus to the first item", async () => {
		// I4 KB3: Home/End keys are a WAI-ARIA requirement for roving tabindex.
		const user = userEvent.setup();
		render(<TestHarness itemCount={5} />);
		const buttons = screen.getAllByRole("button");
		// Navigate to the middle then press Home.
		buttons[0].focus();
		await user.keyboard("{ArrowDown}");
		await user.keyboard("{ArrowDown}");
		await user.keyboard("{ArrowDown}");
		expect(screen.getByTestId("active-index").textContent).toBe("3");
		await user.keyboard("{Home}");
		expect(screen.getByTestId("active-index").textContent).toBe("0");
		expect(document.activeElement).toBe(buttons[0]);
	});

	it("End key jumps focus to the last item", async () => {
		const user = userEvent.setup();
		render(<TestHarness itemCount={5} />);
		const buttons = screen.getAllByRole("button");
		buttons[0].focus();
		await user.keyboard("{End}");
		expect(screen.getByTestId("active-index").textContent).toBe("4");
		expect(document.activeElement).toBe(buttons[4]);
	});
});
