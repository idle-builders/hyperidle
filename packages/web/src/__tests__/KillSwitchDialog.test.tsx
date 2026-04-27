/**
 * L7 — KillSwitchDialog component (red phase).
 *
 * Pins the AC from `docs/work-packages/TRACK-L.md` L7 +
 * `.pipeline-plan.md` §6:
 *
 *   - Renders blast-radius preview text from props.
 *   - Type-to-confirm: typing the factory/target name enables Submit.
 *   - Press-and-hold: 1.5s hold enables Submit; release-early cancels.
 *   - Reason field is required; empty rejects.
 *   - ESC dismisses; focus returns to invoking element.
 *   - Mode is read from props.
 *
 * These tests MUST fail today: KillSwitchDialog does not exist.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KillSwitchDialog } from "../components/KillSwitchDialog";

interface BaseProps {
	open: boolean;
	verb: "factory_pause" | "rollback" | "session_pause";
	target: { id: string; name: string };
	blastRadius: string;
	onConfirm: (input: { reason: string }) => Promise<void> | void;
	onCancel: () => void;
}

function defaultProps(over?: Partial<BaseProps>): BaseProps {
	return {
		open: true,
		verb: "factory_pause",
		target: { id: "factory", name: "HyperIdle" },
		blastRadius: "This will pause 3 sessions across 1 product",
		onConfirm: vi.fn().mockResolvedValue(undefined),
		onCancel: vi.fn(),
		...over,
	};
}

describe("L7 — KillSwitchDialog", () => {
	beforeEach(() => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
	});
	afterEach(() => {
		vi.runOnlyPendingTimers();
		vi.useRealTimers();
	});

	it("renders the blast-radius preview from props", () => {
		render(<KillSwitchDialog {...defaultProps()} mode="type_name" />);
		expect(screen.getByText(/pause 3 sessions across 1 product/i)).toBeInTheDocument();
	});

	it("type-to-confirm: empty type field disables Submit", () => {
		render(<KillSwitchDialog {...defaultProps()} mode="type_name" />);
		const submit = screen.getByRole("button", { name: /confirm|pause/i });
		expect(submit).toBeDisabled();
	});

	it("type-to-confirm: typing the target name enables Submit", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		render(<KillSwitchDialog {...defaultProps()} mode="type_name" />);
		const reason = screen.getByLabelText(/reason|rationale/i);
		await user.type(reason, "spotted bad output");
		const typeField = screen.getByLabelText(/type.*hyperidle|confirm.*name/i);
		await user.type(typeField, "HyperIdle");
		const submit = screen.getByRole("button", { name: /confirm|pause/i });
		expect(submit).not.toBeDisabled();
	});

	it("type-to-confirm: empty reason rejects (submit disabled even after name match)", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		render(<KillSwitchDialog {...defaultProps()} mode="type_name" />);
		const typeField = screen.getByLabelText(/type.*hyperidle|confirm.*name/i);
		await user.type(typeField, "HyperIdle");
		const submit = screen.getByRole("button", { name: /confirm|pause/i });
		expect(submit).toBeDisabled();
	});

	it("press-and-hold: 1.5s hold fires onConfirm with the reason", async () => {
		const onConfirm = vi.fn().mockResolvedValue(undefined);
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		render(<KillSwitchDialog {...defaultProps({ onConfirm })} mode="press_hold" />);
		const reason = screen.getByLabelText(/reason|rationale/i);
		await user.type(reason, "spotted bad output");
		const holdBtn = screen.getByRole("button", { name: /hold to confirm|press.*hold/i });
		// Use raw fireEvent because pointer events + fake timers + userEvent
		// don't always cooperate. PointerEventInit is not available in jsdom,
		// so dispatch the lifecycle directly.
		holdBtn.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
		vi.advanceTimersByTime(1600);
		holdBtn.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
		await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
		expect(onConfirm).toHaveBeenCalledWith({ reason: "spotted bad output" });
	});

	it("press-and-hold: releasing before 1.5s does NOT fire onConfirm", async () => {
		const onConfirm = vi.fn().mockResolvedValue(undefined);
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		render(<KillSwitchDialog {...defaultProps({ onConfirm })} mode="press_hold" />);
		const reason = screen.getByLabelText(/reason|rationale/i);
		await user.type(reason, "spotted bad output");
		const holdBtn = screen.getByRole("button", { name: /hold to confirm|press.*hold/i });
		holdBtn.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
		vi.advanceTimersByTime(800);
		holdBtn.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
		vi.advanceTimersByTime(2000);
		expect(onConfirm).not.toHaveBeenCalled();
	});

	it("ESC dismisses the dialog (calls onCancel)", async () => {
		const onCancel = vi.fn();
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		render(<KillSwitchDialog {...defaultProps({ onCancel })} mode="press_hold" />);
		await user.keyboard("{Escape}");
		expect(onCancel).toHaveBeenCalled();
	});

	it("rationale textarea has maxLength=500", () => {
		render(<KillSwitchDialog {...defaultProps()} mode="press_hold" />);
		const reason = screen.getByLabelText(/reason|rationale/i) as HTMLTextAreaElement;
		expect(reason.maxLength).toBe(500);
	});
});
