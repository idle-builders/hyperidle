/**
 * L1a — `ReviewVerdictBar` rendering + interaction tests.
 *
 * Approved-design: §2.3. The bar exposes the 5 binding verdicts.
 * NO keyboard verb shortcuts. Non-binding replies and sidecar actions
 * land in L1b (L1 step5 S-C1).
 */

import { ReviewVerdictBar } from "@hyperidle/design-system";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

describe("ReviewVerdictBar (approved.md §2.3)", () => {
	it("renders the 5 binding verdict buttons", () => {
		const onAction = vi.fn();
		render(<ReviewVerdictBar onAction={onAction} />);
		expect(screen.getByRole("button", { name: /^approve$/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /approve with comments/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /request changes/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /^edit$/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /reject/i })).toBeInTheDocument();
	});

	it("renders exactly the 5 binding buttons (no dead non-binding/sidecar)", () => {
		const onAction = vi.fn();
		render(<ReviewVerdictBar onAction={onAction} />);
		expect(screen.getAllByRole("button")).toHaveLength(5);
		expect(screen.queryByRole("button", { name: /^comment$/i })).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /inline.?comment/i })).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /^reply$/i })).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /snooze/i })).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /escalate/i })).not.toBeInTheDocument();
	});

	it("calls onAction('approve') when Approve is clicked", async () => {
		const onAction = vi.fn();
		render(<ReviewVerdictBar onAction={onAction} />);
		await userEvent.click(screen.getByRole("button", { name: /^approve$/i }));
		expect(onAction).toHaveBeenCalledWith("approve");
	});

	it("disables all buttons when disabled=true (action-in-flight)", () => {
		const onAction = vi.fn();
		render(<ReviewVerdictBar onAction={onAction} disabled={true} />);
		const buttons = screen.getAllByRole("button");
		for (const b of buttons) {
			expect(b).toBeDisabled();
		}
	});
});
