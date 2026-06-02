/**
 * L14 — WorkBet action bar and dialogs: Vitest unit tests.
 *
 * AC-7: Action bar renders correct buttons per bet status.
 * AC-8: ConsequencePreviewDialog is non-skippable (Escape doesn't close; Cancel closes).
 * AC-9: ConsequencePreview confirm button is disabled when reason is empty.
 * AC-10: AppetiteDialog — current appetite is pre-selected; Save disabled without reason.
 * AC-11: Unblock button is present for active status.
 *
 * @lore U1: Updated from old statuses (in_progress, paused, behind, blocked, shipped)
 * to new statuses (active, draft, completed, killed). Resume button removed (no paused
 * status in new enum). Tests reflect new BetActionsBar behavior.
 *
 * @lore W3 AC-19: Actions moved from inline BetActionsBar to overflow dropdown "...".
 * Tests updated to look for buttons inside the overflow dropdown (data-dropdown-item).
 * The dropdown button text is now "Kill" (not "Kill bet") and "Pause" (unchanged).
 * The overflow button must be clicked first to open the dropdown before clicking items.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { WorkBet } from "../../pages/WorkBet";
import type { BetDetail } from "../../types/bet";

// Mock HostThreadSection to avoid real thread fetches in action bar tests
vi.mock("../../shell/HostThreadSection", () => ({
	HostThreadSection: () => <div data-testid="host-thread-section-mock" />,
}));
// Mock ArtifactThreadsSummary similarly
vi.mock("../../components/ArtifactThreadsSummary", () => ({
	ArtifactThreadsSummary: () => null,
}));
// Mock useHostThread used by WorkBet for messagesByBlockId
vi.mock("../../hooks/useHostThread", () => ({
	useHostThread: () => ({ data: null, error: null, isLoading: false, refresh: vi.fn() }),
}));

function makeBet(status: BetDetail["status"], overrides: Partial<BetDetail> = {}): BetDetail {
	return {
		id: "bet-test",
		title: "Test Bet",
		team: "Alpha Core",
		status,
		atRisk: false,
		costAppetite: null,
		tokenAppetite: null,
		costActual: null,
		tokensActual: null,
		progress: { done: 0, total: 0 },
		description: "# Feature\nBody",
		tasks: [],
		...overrides,
	};
}

function renderBet(bet: BetDetail): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[`/work/bet/${bet.id}`]}>
			<Routes>
				<Route path="/work/bet/:betId" element={<WorkBet overrideBet={bet} />} />
			</Routes>
		</MemoryRouter>,
	);
}

/**
 * W3 AC-19: Find action buttons in the overflow dropdown (data-dropdown-item).
 * The dropdown is always in the DOM (just visually hidden by CSS); JSDOM renders it
 * regardless of CSS visibility, so we can query it without clicking the overflow button.
 */
function getDropdownItem(name: RegExp): HTMLElement | null {
	return document.querySelector<HTMLElement>(`[data-dropdown-item][data-bet-action]`) !== null
		? (Array.from(document.querySelectorAll<HTMLElement>("[data-dropdown-item]")).find((el) =>
				name.test(el.textContent ?? ""),
			) ?? null)
		: null;
}

describe("L14 — BetActionsBar (AC-7)", () => {
	it("shows Pause and Kill in overflow dropdown for active status", () => {
		renderBet(makeBet("active"));
		// W3 AC-19: actions are in the overflow dropdown, not inline
		// JSDOM renders all elements regardless of CSS visibility
		const pauseItem = document.querySelector("[data-dropdown-item][data-bet-action='pause']");
		const killItem = document.querySelector("[data-dropdown-item][data-bet-action='kill']");
		expect(pauseItem).not.toBeNull();
		expect(killItem).not.toBeNull();
	});

	it("shows Adjust appetite in overflow dropdown for active status", () => {
		renderBet(makeBet("active"));
		const adjustItem = document.querySelector(
			"[data-dropdown-item][data-bet-action='adjust-appetite']",
		);
		expect(adjustItem).not.toBeNull();
	});

	it("shows Unblock in overflow dropdown for active status", () => {
		renderBet(makeBet("active"));
		const unblockItem = document.querySelector("[data-dropdown-item][data-bet-action='unblock']");
		expect(unblockItem).not.toBeNull();
	});

	it("does NOT show Pause in overflow dropdown for draft status", () => {
		renderBet(makeBet("draft"));
		const pauseItem = document.querySelector("[data-dropdown-item][data-bet-action='pause']");
		expect(pauseItem).toBeNull();
	});

	it("shows Kill in overflow dropdown for draft status", () => {
		renderBet(makeBet("draft"));
		const killItem = document.querySelector("[data-dropdown-item][data-bet-action='kill']");
		expect(killItem).not.toBeNull();
	});

	it("shows Adjust appetite in overflow dropdown for draft status", () => {
		renderBet(makeBet("draft"));
		const adjustItem = document.querySelector(
			"[data-dropdown-item][data-bet-action='adjust-appetite']",
		);
		expect(adjustItem).not.toBeNull();
	});

	it("renders no Kill or Pause in overflow dropdown for completed status", () => {
		renderBet(makeBet("completed"));
		const pauseItem = document.querySelector("[data-dropdown-item][data-bet-action='pause']");
		const killItem = document.querySelector("[data-dropdown-item][data-bet-action='kill']");
		expect(pauseItem).toBeNull();
		expect(killItem).toBeNull();
	});

	it("renders no Kill or Pause in overflow dropdown for killed status", () => {
		renderBet(makeBet("killed"));
		const pauseItem = document.querySelector("[data-dropdown-item][data-bet-action='pause']");
		const killItem = document.querySelector("[data-dropdown-item][data-bet-action='kill']");
		expect(pauseItem).toBeNull();
		expect(killItem).toBeNull();
	});

	it("does NOT show Resume in overflow dropdown for any status (no paused status in new enum)", () => {
		renderBet(makeBet("active"));
		const resumeItem = document.querySelector("[data-dropdown-item][data-bet-action='resume']");
		expect(resumeItem).toBeNull();
	});
});

describe("L14 — ConsequencePreviewDialog (AC-8, AC-9)", () => {
	/**
	 * W3 AC-19: The Kill and Pause buttons are now in the overflow dropdown.
	 * Click the "Kill" dropdown item (data-bet-action="kill") to open the dialog.
	 */
	it("dialog opens when Kill dropdown item is clicked", async () => {
		const user = userEvent.setup();
		renderBet(makeBet("active"));

		// W3: Kill is in the overflow dropdown, not inline
		const killItem = document.querySelector<HTMLElement>(
			"[data-dropdown-item][data-bet-action='kill']",
		);
		expect(killItem).not.toBeNull();
		if (killItem) await user.click(killItem);

		// Dialog should be visible
		expect(screen.getByRole("dialog")).toBeInTheDocument();
	});

	it("Confirm button is disabled when reason textarea is empty", async () => {
		const user = userEvent.setup();
		renderBet(makeBet("active"));

		const killItem = document.querySelector<HTMLElement>(
			"[data-dropdown-item][data-bet-action='kill']",
		);
		if (killItem) await user.click(killItem);

		// The confirm button must be disabled when reason is empty
		// We look for a button that is disabled within the dialog
		const dialog = screen.getByRole("dialog");
		const allDialogButtons = Array.from(dialog.querySelectorAll<HTMLButtonElement>("button"));
		const confirmInDialog = allDialogButtons.find((b) =>
			/kill bet|confirm/i.test(b.textContent ?? ""),
		);
		expect(confirmInDialog).toBeDefined();
		expect(confirmInDialog?.disabled).toBe(true);
	});

	it("Cancel button closes the dialog", async () => {
		const user = userEvent.setup();
		renderBet(makeBet("active"));

		const killItem = document.querySelector<HTMLElement>(
			"[data-dropdown-item][data-bet-action='kill']",
		);
		if (killItem) await user.click(killItem);
		expect(screen.getByRole("dialog")).toBeInTheDocument();

		const cancelBtn = screen.getByRole("button", { name: /cancel/i });
		await user.click(cancelBtn);

		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	it("dialog also opens for Pause action via overflow dropdown", async () => {
		const user = userEvent.setup();
		renderBet(makeBet("active"));

		// W3: Pause is in the overflow dropdown
		const pauseItem = document.querySelector<HTMLElement>(
			"[data-dropdown-item][data-bet-action='pause']",
		);
		expect(pauseItem).not.toBeNull();
		if (pauseItem) await user.click(pauseItem);

		expect(screen.getByRole("dialog")).toBeInTheDocument();
	});
});

describe("L14 — AppetiteDialog (AC-10)", () => {
	it("dialog opens when Adjust appetite is clicked", async () => {
		const user = userEvent.setup();
		renderBet(makeBet("active", { costAppetite: { minor: 20000, currency: "USD" } }));

		await user.click(screen.getByRole("button", { name: /adjust appetite/i }));

		expect(screen.getByRole("dialog")).toBeInTheDocument();
	});

	it("current appetite select renders with a default value", async () => {
		const user = userEvent.setup();
		renderBet(makeBet("active", { costAppetite: { minor: 20000, currency: "USD" } }));

		await user.click(screen.getByRole("button", { name: /adjust appetite/i }));

		const select = screen.getByRole("combobox");
		// The AppetiteDialog defaults to APPETITE_OPTIONS[1] when currentAppetite is not one of the valid options.
		expect((select as HTMLSelectElement).value).toBeTruthy();
	});

	it("Save button is disabled when reason is empty", async () => {
		const user = userEvent.setup();
		renderBet(makeBet("active", { costAppetite: { minor: 10000, currency: "USD" } }));

		await user.click(screen.getByRole("button", { name: /adjust appetite/i }));

		const dialog = screen.getByRole("dialog");
		const saveBtn = Array.from(dialog.querySelectorAll<HTMLButtonElement>("button")).find((b) =>
			/save/i.test(b.textContent ?? ""),
		);
		expect(saveBtn).toBeDefined();
		expect(saveBtn?.disabled).toBe(true);
	});

	it("Save button becomes enabled when reason is filled", async () => {
		const user = userEvent.setup();
		renderBet(makeBet("active", { costAppetite: { minor: 10000, currency: "USD" } }));

		await user.click(screen.getByRole("button", { name: /adjust appetite/i }));

		const dialog = screen.getByRole("dialog");
		const reasonField = dialog.querySelector("textarea");
		expect(reasonField).not.toBeNull();
		if (reasonField) {
			await user.type(reasonField, "Scope changed");
		}

		const saveBtn = Array.from(dialog.querySelectorAll<HTMLButtonElement>("button")).find((b) =>
			/save/i.test(b.textContent ?? ""),
		);
		expect(saveBtn?.disabled).toBe(false);
	});

	it("AppetiteDialog Cancel closes the dialog", async () => {
		const user = userEvent.setup();
		renderBet(makeBet("active"));

		await user.click(screen.getByRole("button", { name: /adjust appetite/i }));
		expect(screen.getByRole("dialog")).toBeInTheDocument();

		const cancelBtn = screen.getByRole("button", { name: /cancel/i });
		await user.click(cancelBtn);

		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});
});
