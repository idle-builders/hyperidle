/**
 * L1a — `ReviewVerdictBar` rendering + interaction tests.
 *
 * Approved-design: §2.3. The bar exposes 5 binding verdicts +
 * 3 non-binding (comment / inline-comment / reply) +
 * 2 sidecar (snooze / escalate). NO keyboard verb shortcuts.
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

	it("renders the 3 non-binding reply buttons", () => {
		const onAction = vi.fn();
		render(<ReviewVerdictBar onAction={onAction} />);
		expect(screen.getByRole("button", { name: /^comment$/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /inline.?comment/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /^reply$/i })).toBeInTheDocument();
	});

	it("renders the 2 sidecar action links (snooze / escalate)", () => {
		const onAction = vi.fn();
		render(<ReviewVerdictBar onAction={onAction} />);
		expect(screen.getByRole("button", { name: /snooze/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /escalate/i })).toBeInTheDocument();
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
