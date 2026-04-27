/**
 * L4 — ReviewHeader click parity + reversibility chip (red phase).
 *
 * Pins the contract from `.plan-L4.md` § 3.3.1:
 *
 *   - Mouse click on a primary verdict in the default `verdictDoubleClick=true`
 *     state pre-fills (calls `onPrefill`); a second click on the same verdict
 *     commits (calls `onCommit`).
 *   - First click does NOT commit (no API call) — the existing test in
 *     `ReviewHeader.test.tsx` that expected immediate commit is superseded by
 *     this contract.
 *   - When `verdictDoubleClick=false`, a single click commits directly (single
 *     click warning copy is rendered in Settings, not the header — see
 *     `SettingsPanel.undo.test.tsx`).
 *   - The pre-filled button label swaps to `Confirm Approve` (etc.) and
 *     advertises `aria-pressed=true`.
 *   - Reversibility chip:
 *       reversibility === true  → `↶ undoable` chip is in the DOM
 *       reversibility === false / null / undefined → chip is absent
 *
 * These tests MUST fail today: ReviewHeader exposes `onVerdict` only and
 * commits immediately on first click; no `pendingVerdict` / `onPrefill` /
 * `onCommit` / `verdictDoubleClick` / `reversibility` props exist.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { VerdictAction } from "../shell/ReviewHeader";
import { ReviewHeader } from "../shell/ReviewHeader";

interface ReviewHeaderL4Props {
	proposer: { name: string; timestamp: string; avatarUrl?: string };
	onPrefill: (action: VerdictAction) => void;
	onCommit: (action: VerdictAction) => void;
	pendingVerdict: VerdictAction | null;
	verdictDoubleClick: boolean;
	blocking?: boolean;
	reversibility?: boolean | null;
}

function L4Props(over: Partial<ReviewHeaderL4Props> = {}): ReviewHeaderL4Props {
	return {
		proposer: { name: "Agent-Alpha", timestamp: "2 min ago" },
		onPrefill: vi.fn(),
		onCommit: vi.fn(),
		pendingVerdict: null,
		verdictDoubleClick: true,
		...over,
	};
}

describe("L4 — ReviewHeader click parity", () => {
	it("verdictDoubleClick=true: first click on Approve calls onPrefill, NOT onCommit", async () => {
		const onPrefill = vi.fn();
		const onCommit = vi.fn();
		const user = userEvent.setup();
		// @ts-expect-error — props refactored in green phase.
		render(<ReviewHeader {...L4Props({ onPrefill, onCommit, verdictDoubleClick: true })} />);

		await user.click(screen.getByRole("button", { name: /approve/i }));
		expect(onPrefill).toHaveBeenCalledTimes(1);
		expect(onPrefill).toHaveBeenCalledWith("approve");
		expect(onCommit).not.toHaveBeenCalled();
	});

	it("verdictDoubleClick=true: same-button second click (pendingVerdict pre-set) calls onCommit", async () => {
		const onPrefill = vi.fn();
		const onCommit = vi.fn();
		const user = userEvent.setup();
		render(
			// @ts-expect-error — props refactored in green phase.
			<ReviewHeader
				{...L4Props({
					onPrefill,
					onCommit,
					verdictDoubleClick: true,
					pendingVerdict: "approve",
				})}
			/>,
		);

		await user.click(screen.getByRole("button", { name: /approve/i }));
		expect(onCommit).toHaveBeenCalledTimes(1);
		expect(onCommit).toHaveBeenCalledWith("approve");
	});

	it("verdictDoubleClick=true: pre-filled Approve renders 'Confirm Approve' label and aria-pressed=true", () => {
		render(
			// @ts-expect-error — props refactored in green phase.
			<ReviewHeader {...L4Props({ verdictDoubleClick: true, pendingVerdict: "approve" })} />,
		);
		const approveBtn = screen.getByRole("button", { name: /confirm approve/i });
		expect(approveBtn).toBeInTheDocument();
		expect(approveBtn).toHaveAttribute("aria-pressed", "true");
	});

	it("verdictDoubleClick=false: single click commits directly", async () => {
		const onPrefill = vi.fn();
		const onCommit = vi.fn();
		const user = userEvent.setup();
		render(
			// @ts-expect-error — props refactored in green phase.
			<ReviewHeader {...L4Props({ onPrefill, onCommit, verdictDoubleClick: false })} />,
		);

		await user.click(screen.getByRole("button", { name: /approve/i }));
		expect(onCommit).toHaveBeenCalledTimes(1);
		expect(onCommit).toHaveBeenCalledWith("approve");
		expect(onPrefill).not.toHaveBeenCalled();
	});
});

describe("L4 — Reversibility chip (gated on artifact.reversibility === true)", () => {
	it("renders ↶ undoable chip when reversibility === true", () => {
		render(
			// @ts-expect-error — prop introduced in green phase.
			<ReviewHeader {...L4Props({ reversibility: true })} />,
		);
		expect(screen.getByText(/undoable/i)).toBeInTheDocument();
	});

	it("hides the chip when reversibility === false", () => {
		render(
			// @ts-expect-error — prop introduced in green phase.
			<ReviewHeader {...L4Props({ reversibility: false })} />,
		);
		expect(screen.queryByText(/undoable/i)).toBeNull();
	});

	it("hides the chip when reversibility is null", () => {
		render(
			// @ts-expect-error — prop introduced in green phase.
			<ReviewHeader {...L4Props({ reversibility: null })} />,
		);
		expect(screen.queryByText(/undoable/i)).toBeNull();
	});

	it("hides the chip when reversibility is undefined (default)", () => {
		// L4 default — no metadata yet; chip must NOT render.
		render(
			// @ts-expect-error — prop introduced in green phase.
			<ReviewHeader {...L4Props()} />,
		);
		expect(screen.queryByText(/undoable/i)).toBeNull();
	});
});
