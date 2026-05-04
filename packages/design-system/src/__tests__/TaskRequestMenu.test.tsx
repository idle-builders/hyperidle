/**
 * L15 — TaskRequestMenu component tests.
 *
 * Source of truth: `plans/L15-plan.md` §4.1 + AC-2a/b/c/d + approved.md
 * §1-§7 (trigger + menu + state-gating + footer + Open thread + payload).
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { TaskRequestMenu } from "../TaskRequestMenu";

const baseProps = {
	taskId: "task-1",
	onSubmitRequest: vi.fn(async () => {}),
	onOpenThread: vi.fn(),
};

describe("L15 — TaskRequestMenu trigger + menu opening (AC-2a)", () => {
	it("renders a single trigger with the correct aria-label", async () => {
		render(<TaskRequestMenu {...baseProps} currentState="in_progress" />);
		const trigger = screen.getByRole("button", { name: /request a change to this task/i });
		expect(trigger).toBeInTheDocument();
		expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
	});

	it("opens the menu on trigger click (aria-expanded toggles)", async () => {
		const user = userEvent.setup();
		render(<TaskRequestMenu {...baseProps} currentState="in_progress" />);
		const trigger = screen.getByRole("button", { name: /request a change to this task/i });
		expect(trigger.getAttribute("aria-expanded")).toBe("false");
		await user.click(trigger);
		expect(trigger.getAttribute("aria-expanded")).toBe("true");
	});
});

describe("L15 — TaskRequestMenu state-gating (approved.md §3, AC-2a/b)", () => {
	it("in_progress: shows Block, Review, Done, Abandon", async () => {
		const user = userEvent.setup();
		render(<TaskRequestMenu {...baseProps} currentState="in_progress" />);
		await user.click(screen.getByRole("button", { name: /request a change/i }));
		const menu = screen.getByRole("menu");
		const items = within(menu).getAllByRole("menuitem");
		const labels = items.map((i) => i.textContent ?? "");
		expect(labels.some((l) => /Block/i.test(l))).toBe(true);
		expect(labels.some((l) => /Review/i.test(l))).toBe(true);
		expect(labels.some((l) => /Done/i.test(l))).toBe(true);
		expect(labels.some((l) => /Abandon/i.test(l))).toBe(true);
		// Open Thread row is always present.
		expect(labels.some((l) => /Open thread/i.test(l))).toBe(true);
	});

	it("accepted: shows Start, Block, Abandon (no Review/Done)", async () => {
		const user = userEvent.setup();
		render(<TaskRequestMenu {...baseProps} currentState="accepted" />);
		await user.click(screen.getByRole("button", { name: /request a change/i }));
		const menu = screen.getByRole("menu");
		const labels = within(menu)
			.getAllByRole("menuitem")
			.map((i) => i.textContent ?? "");
		expect(labels.some((l) => /Start/i.test(l))).toBe(true);
		expect(labels.some((l) => /Block/i.test(l))).toBe(true);
		expect(labels.some((l) => /Abandon/i.test(l))).toBe(true);
		expect(labels.some((l) => /\bDone\b/i.test(l))).toBe(false);
		expect(labels.some((l) => /\bReview\b/i.test(l))).toBe(false);
	});

	it("hold/blocked: shows Resume (not Start) for the → in_progress target", async () => {
		const user = userEvent.setup();
		render(<TaskRequestMenu {...baseProps} currentState="blocked" />);
		await user.click(screen.getByRole("button", { name: /request a change/i }));
		const menu = screen.getByRole("menu");
		const labels = within(menu)
			.getAllByRole("menuitem")
			.map((i) => i.textContent ?? "");
		expect(labels.some((l) => /Resume/i.test(l))).toBe(true);
		expect(labels.some((l) => /\bStart\b/i.test(l))).toBe(false);
	});

	it("proposed: shows ZERO state-target rows (only Note input + Open thread)", async () => {
		const user = userEvent.setup();
		render(<TaskRequestMenu {...baseProps} currentState="proposed" />);
		await user.click(screen.getByRole("button", { name: /request a change/i }));
		const menu = screen.getByRole("menu");
		// The only menuitem present is "Open thread"; no state targets.
		const items = within(menu).getAllByRole("menuitem");
		const labels = items.map((i) => i.textContent ?? "");
		expect(labels.some((l) => /Open thread/i.test(l))).toBe(true);
		expect(labels.some((l) => /Block/i.test(l))).toBe(false);
		expect(labels.some((l) => /Done/i.test(l))).toBe(false);
		expect(labels.some((l) => /Abandon/i.test(l))).toBe(false);
	});

	it("killed: shows ZERO state-target rows", async () => {
		const user = userEvent.setup();
		render(<TaskRequestMenu {...baseProps} currentState="killed" />);
		await user.click(screen.getByRole("button", { name: /request a change/i }));
		const menu = screen.getByRole("menu");
		const labels = within(menu)
			.getAllByRole("menuitem")
			.map((i) => i.textContent ?? "");
		expect(labels.some((l) => /Open thread/i.test(l))).toBe(true);
		expect(labels.some((l) => /Block|Done|Abandon|Resume|Start|Review/i.test(l))).toBe(false);
	});
});

describe("L15 — TaskRequestMenu footer (AC-2c, approved §2.7)", () => {
	it("renders the load-bearing footer line", async () => {
		const user = userEvent.setup();
		render(<TaskRequestMenu {...baseProps} currentState="in_progress" />);
		await user.click(screen.getByRole("button", { name: /request a change/i }));
		expect(screen.getByText(/Agent decides whether to honor the request\./i)).toBeInTheDocument();
	});
});

describe("L15 — TaskRequestMenu submit behaviour (AC-2d)", () => {
	it("clicking 'Block' (no note) calls onSubmitRequest with targetState=blocked, note=null", async () => {
		const user = userEvent.setup();
		const onSubmit = vi.fn(async () => {});
		render(
			<TaskRequestMenu {...baseProps} onSubmitRequest={onSubmit} currentState="in_progress" />,
		);
		await user.click(screen.getByRole("button", { name: /request a change/i }));
		await user.click(screen.getByRole("menuitem", { name: /Block/i }));
		expect(onSubmit).toHaveBeenCalledTimes(1);
		expect(onSubmit).toHaveBeenCalledWith({
			targetState: "blocked",
			note: null,
		});
	});

	it("typing in the Note input + clicking 'Block' submits with the note", async () => {
		const user = userEvent.setup();
		const onSubmit = vi.fn(async () => {});
		render(
			<TaskRequestMenu {...baseProps} onSubmitRequest={onSubmit} currentState="in_progress" />,
		);
		await user.click(screen.getByRole("button", { name: /request a change/i }));
		const input = screen.getByLabelText(/Note for the agent/i);
		await user.type(input, "waiting on staging");
		await user.click(screen.getByRole("menuitem", { name: /Block/i }));
		expect(onSubmit).toHaveBeenCalledWith({
			targetState: "blocked",
			note: "waiting on staging",
		});
	});

	it("Note + Enter (no target) submits with targetState=null and the note text", async () => {
		const user = userEvent.setup();
		const onSubmit = vi.fn(async () => {});
		render(
			<TaskRequestMenu {...baseProps} onSubmitRequest={onSubmit} currentState="in_progress" />,
		);
		await user.click(screen.getByRole("button", { name: /request a change/i }));
		const input = screen.getByLabelText(/Note for the agent/i);
		await user.type(input, "FYI{Enter}");
		expect(onSubmit).toHaveBeenCalledWith({
			targetState: null,
			note: "FYI",
		});
	});

	it("clicking 'Open thread' calls onOpenThread (and does NOT call onSubmitRequest)", async () => {
		const user = userEvent.setup();
		const onSubmit = vi.fn(async () => {});
		const onOpen = vi.fn();
		render(
			<TaskRequestMenu
				{...baseProps}
				onSubmitRequest={onSubmit}
				onOpenThread={onOpen}
				currentState="in_progress"
			/>,
		);
		await user.click(screen.getByRole("button", { name: /request a change/i }));
		await user.click(screen.getByRole("menuitem", { name: /Open thread/i }));
		expect(onOpen).toHaveBeenCalledTimes(1);
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("clicking the trigger does NOT bubble to a parent onClick (stopPropagation)", async () => {
		const user = userEvent.setup();
		const parentClick = vi.fn();
		// Test scaffolding: a focusable role-bearing div with an explicit
		// keydown handler satisfies the design lint rule
		// `require-focus-on-interactive`. We assert stopPropagation by relying
		// on this div's onClick NOT firing when the trigger inside is clicked.
		const handleParentKey = (e: React.KeyboardEvent<HTMLDivElement>): void => {
			if (e.key === "Enter" || e.key === " ") parentClick();
		};
		render(
			<div
				role="button"
				tabIndex={0}
				onClick={parentClick}
				onKeyDown={handleParentKey}
				className="focus-visible:outline"
			>
				<TaskRequestMenu {...baseProps} currentState="in_progress" />
			</div>,
		);
		await user.click(screen.getByRole("button", { name: /request a change/i }));
		expect(parentClick).not.toHaveBeenCalled();
	});
});

describe("L15 review C2 — inline read-after-write confirmation", () => {
	it("after a successful submit, shows 'Sent — agent will decide.' before auto-close", async () => {
		const user = userEvent.setup();
		const onSubmit = vi.fn(async () => {});
		render(
			<TaskRequestMenu {...baseProps} onSubmitRequest={onSubmit} currentState="in_progress" />,
		);
		await user.click(screen.getByRole("button", { name: /request a change/i }));
		await user.click(screen.getByRole("menuitem", { name: /Block/i }));
		// The confirmation appears (synchronously after the awaited promise).
		const confirmation = await screen.findByTestId("task-request-confirmation");
		expect(confirmation.textContent).toMatch(/Sent — agent will decide\./i);
	});
});

describe("L15 — TaskRequestMenu keyboard (Esc closes; trigger regains focus)", () => {
	it("Esc closes the menu and restores focus to the trigger", async () => {
		const user = userEvent.setup();
		render(<TaskRequestMenu {...baseProps} currentState="in_progress" />);
		const trigger = screen.getByRole("button", { name: /request a change/i });
		await user.click(trigger);
		expect(trigger.getAttribute("aria-expanded")).toBe("true");
		await user.keyboard("{Escape}");
		expect(trigger.getAttribute("aria-expanded")).toBe("false");
		expect(trigger).toHaveFocus();
	});
});
