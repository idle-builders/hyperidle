/**
 * L4 — UndoToast (red phase).
 *
 * Pins the contract from `.plan-L4.md` § 3.3.3:
 *   - Renders only when `visible` is true.
 *   - Shows a countdown reflecting the configured window.
 *   - Default state (agentActed=false): renders an `Undo` button + `(U)` hint.
 *   - agentActed=true: swaps to a `View what shipped` link with the audit row href.
 *   - aria-live="polite" + role="status" for assistive tech.
 *   - Esc dismisses without calling onUndo.
 *   - Pressing the Undo button calls onUndo (which the page handler then
 *     wires to the API).
 *
 * These tests MUST fail today: the component does not yet exist.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UndoToast, type UndoToastProps } from "../components/UndoToast";

function defaultProps(over: Partial<UndoToastProps> = {}): UndoToastProps {
	return {
		visible: true,
		threadId: "thread-1",
		windowSeconds: 8,
		agentActed: false,
		auditRowId: "resp-1",
		onUndo: vi.fn(async () => undefined),
		onDismiss: vi.fn(),
		...over,
	};
}

describe("UndoToast (L4)", () => {
	it("does not render when visible=false", () => {
		const { container } = render(<UndoToast {...defaultProps({ visible: false })} />);
		expect(container).toBeEmptyDOMElement();
	});

	it("renders an Undo action with a (U) keyboard hint when agent has not acted", () => {
		render(<UndoToast {...defaultProps({ agentActed: false })} />);
		const undoButton = screen.getByRole("button", { name: /undo/i });
		expect(undoButton).toBeInTheDocument();
		// The hint mentions the U key (in the visible label or kbd hint).
		expect(undoButton.textContent ?? "").toMatch(/U/);
	});

	it("countdown text reflects the configured window seconds (8 by default)", () => {
		render(<UndoToast {...defaultProps({ windowSeconds: 8 })} />);
		// Countdown should be visible somewhere in the toast.
		expect(screen.getByText(/8/)).toBeInTheDocument();
	});

	it("clicking Undo calls onUndo", async () => {
		const onUndo = vi.fn(async () => undefined);
		const user = userEvent.setup();
		render(<UndoToast {...defaultProps({ onUndo })} />);
		await user.click(screen.getByRole("button", { name: /undo/i }));
		expect(onUndo).toHaveBeenCalledTimes(1);
	});

	it("agentActed=true swaps Undo for a 'View what shipped' link with the audit row href", () => {
		render(
			<UndoToast
				{...defaultProps({
					agentActed: true,
					auditRowId: "resp-42",
					threadId: "thread-9",
				})}
			/>,
		);
		expect(screen.queryByRole("button", { name: /undo/i })).toBeNull();
		const link = screen.getByRole("link", { name: /view what shipped/i });
		expect(link).toBeInTheDocument();
		expect(link.getAttribute("href") ?? "").toMatch(/resp-42/);
		expect(link.getAttribute("href") ?? "").toMatch(/thread-9/);
	});

	it("has aria-live='polite' and role='status' for assistive tech", () => {
		const { container } = render(<UndoToast {...defaultProps()} />);
		const live = container.querySelector('[aria-live="polite"][role="status"]');
		expect(live).not.toBeNull();
	});

	it("Esc keypress while visible calls onDismiss without calling onUndo", async () => {
		const onUndo = vi.fn(async () => undefined);
		const onDismiss = vi.fn();
		const user = userEvent.setup();
		render(<UndoToast {...defaultProps({ onUndo, onDismiss })} />);
		await user.keyboard("{Escape}");
		expect(onDismiss).toHaveBeenCalledTimes(1);
		expect(onUndo).not.toHaveBeenCalled();
	});
});
