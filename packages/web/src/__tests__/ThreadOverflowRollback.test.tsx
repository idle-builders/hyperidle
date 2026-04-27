/**
 * L7 — Rollback verb in thread overflow menu (red phase).
 *
 * Pins AC3 from `docs/work-packages/TRACK-L.md` L7:
 *   "every committed verdict on a reversible artifact gets a Rollback
 *    action in the thread's overflow menu. Rollback writes an audit
 *    row, attempts to reverse the action server-side, and shows a
 *    Rollback succeeded / partially / failed outcome."
 *
 *   - Overflow menu surfaces a Rollback option for committed verdicts.
 *   - Click opens a confirm dialog with reason input.
 *   - On commit, surfaces success/partial/failed toast.
 *
 * These tests MUST fail today: RollbackOverflowItem does not exist.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RollbackOverflowItem } from "../components/RollbackOverflowItem";

describe("L7 — RollbackOverflowItem", () => {
	it("renders a Rollback menuitem when verdict is committed and artifact is reversible", () => {
		render(
			<RollbackOverflowItem
				verdict={{ id: "v1", state: "committed", reversible: true, threadId: "t-1" }}
				onRollback={vi.fn()}
			/>,
		);
		expect(screen.getByRole("menuitem", { name: /rollback/i })).toBeInTheDocument();
	});

	it("does NOT render when artifact is non-reversible", () => {
		render(
			<RollbackOverflowItem
				verdict={{ id: "v1", state: "committed", reversible: false, threadId: "t-1" }}
				onRollback={vi.fn()}
			/>,
		);
		expect(screen.queryByRole("menuitem", { name: /rollback/i })).not.toBeInTheDocument();
	});

	it("clicking Rollback opens a confirm dialog with reason input", async () => {
		const user = userEvent.setup();
		render(
			<RollbackOverflowItem
				verdict={{ id: "v1", state: "committed", reversible: true, threadId: "t-1" }}
				onRollback={vi.fn()}
			/>,
		);
		await user.click(screen.getByRole("menuitem", { name: /rollback/i }));
		expect(screen.getByRole("dialog", { name: /rollback/i })).toBeInTheDocument();
		expect(screen.getByLabelText(/reason|rationale/i)).toBeInTheDocument();
	});

	it("invokes onRollback with the typed reason on confirm", async () => {
		const onRollback = vi.fn().mockResolvedValue({ outcome: "succeeded" });
		const user = userEvent.setup();
		render(
			<RollbackOverflowItem
				verdict={{ id: "v1", state: "committed", reversible: true, threadId: "t-1" }}
				onRollback={onRollback}
			/>,
		);
		await user.click(screen.getByRole("menuitem", { name: /rollback/i }));
		const reason = screen.getByLabelText(/reason|rationale/i);
		await user.type(reason, "agent ignored my comments");
		// Type-to-confirm or any confirm path.
		const confirmBtn = screen.getByRole("button", { name: /confirm rollback|rollback now/i });
		await user.click(confirmBtn);
		expect(onRollback).toHaveBeenCalledWith(
			expect.objectContaining({ reason: "agent ignored my comments" }),
		);
	});
});
