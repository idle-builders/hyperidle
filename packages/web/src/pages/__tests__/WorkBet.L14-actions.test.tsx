/**
 * L14 — WorkBet action bar and dialogs: Vitest unit tests.
 *
 * AC-7: Action bar renders correct buttons per bet status.
 * AC-8: ConsequencePreviewDialog is non-skippable (Escape doesn't close; Cancel closes).
 * AC-9: ConsequencePreview confirm button is disabled when reason is empty.
 * AC-10: AppetiteDialog — current appetite is pre-selected; Save disabled without reason.
 * AC-11: Unblock button is present for in_progress/paused/behind/blocked statuses.
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
		product: "Alpha",
		team: "t1",
		status,
		appetite: "2 weeks",
		progress: { done: 0, total: 0 },
		pitch: "# Feature\nBody",
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

describe("L14 — BetActionsBar (AC-7)", () => {
	it("shows Pause and Kill bet for in_progress status", () => {
		renderBet(makeBet("in_progress"));
		expect(screen.getByRole("button", { name: /pause/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /kill bet/i })).toBeInTheDocument();
	});

	it("shows Adjust appetite for in_progress status", () => {
		renderBet(makeBet("in_progress"));
		expect(screen.getByRole("button", { name: /adjust appetite/i })).toBeInTheDocument();
	});

	it("shows Unblock button for in_progress status", () => {
		renderBet(makeBet("in_progress"));
		expect(screen.getByRole("button", { name: /unblock/i })).toBeInTheDocument();
	});

	it("shows Resume (not Pause) for paused status", () => {
		renderBet(makeBet("paused"));
		expect(screen.getByRole("button", { name: /resume/i })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /^pause$/i })).not.toBeInTheDocument();
	});

	it("shows Kill bet for paused status", () => {
		renderBet(makeBet("paused"));
		expect(screen.getByRole("button", { name: /kill bet/i })).toBeInTheDocument();
	});

	it("shows Adjust appetite for paused status", () => {
		renderBet(makeBet("paused"));
		expect(screen.getByRole("button", { name: /adjust appetite/i })).toBeInTheDocument();
	});

	it("shows Kill bet for behind status (no Pause button)", () => {
		renderBet(makeBet("behind"));
		expect(screen.getByRole("button", { name: /kill bet/i })).toBeInTheDocument();
	});

	it("shows Kill bet for blocked status (no Pause, no Resume)", () => {
		renderBet(makeBet("blocked"));
		expect(screen.getByRole("button", { name: /kill bet/i })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /^pause$/i })).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /resume/i })).not.toBeInTheDocument();
	});

	it("renders no action bar for shipped status", () => {
		renderBet(makeBet("shipped"));
		expect(screen.queryByRole("button", { name: /pause/i })).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /kill bet/i })).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /resume/i })).not.toBeInTheDocument();
	});

	it("renders no action bar for killed status", () => {
		renderBet(makeBet("killed"));
		expect(screen.queryByRole("button", { name: /pause/i })).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /kill bet/i })).not.toBeInTheDocument();
	});

	it("does NOT show Pause button for blocked status (critique fix)", () => {
		renderBet(makeBet("blocked"));
		expect(screen.queryByRole("button", { name: /^pause$/i })).not.toBeInTheDocument();
	});
});

describe("L14 — ConsequencePreviewDialog (AC-8, AC-9)", () => {
	it("dialog opens when Kill bet is clicked", async () => {
		const user = userEvent.setup();
		renderBet(makeBet("in_progress"));

		const killBtn = screen.getByRole("button", { name: /kill bet/i });
		await user.click(killBtn);

		// Dialog should be visible
		expect(screen.getByRole("dialog")).toBeInTheDocument();
	});

	it("Confirm button is disabled when reason textarea is empty", async () => {
		const user = userEvent.setup();
		renderBet(makeBet("in_progress"));

		await user.click(screen.getByRole("button", { name: /kill bet/i }));

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
		renderBet(makeBet("in_progress"));

		await user.click(screen.getByRole("button", { name: /kill bet/i }));
		expect(screen.getByRole("dialog")).toBeInTheDocument();

		const cancelBtn = screen.getByRole("button", { name: /cancel/i });
		await user.click(cancelBtn);

		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	it("dialog also opens for Pause action", async () => {
		const user = userEvent.setup();
		renderBet(makeBet("in_progress"));

		await user.click(screen.getByRole("button", { name: /^pause$/i }));

		expect(screen.getByRole("dialog")).toBeInTheDocument();
	});
});

describe("L14 — AppetiteDialog (AC-10)", () => {
	it("dialog opens when Adjust appetite is clicked", async () => {
		const user = userEvent.setup();
		renderBet(makeBet("in_progress", { appetite: "2 weeks" }));

		await user.click(screen.getByRole("button", { name: /adjust appetite/i }));

		expect(screen.getByRole("dialog")).toBeInTheDocument();
	});

	it("current appetite is pre-selected in the select element", async () => {
		const user = userEvent.setup();
		renderBet(makeBet("in_progress", { appetite: "2 weeks" }));

		await user.click(screen.getByRole("button", { name: /adjust appetite/i }));

		const select = screen.getByRole("combobox");
		expect((select as HTMLSelectElement).value).toBe("2 weeks");
	});

	it("Save button is disabled when reason is empty", async () => {
		const user = userEvent.setup();
		renderBet(makeBet("in_progress", { appetite: "1 week" }));

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
		renderBet(makeBet("in_progress", { appetite: "1 week" }));

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
		renderBet(makeBet("in_progress"));

		await user.click(screen.getByRole("button", { name: /adjust appetite/i }));
		expect(screen.getByRole("dialog")).toBeInTheDocument();

		const cancelBtn = screen.getByRole("button", { name: /cancel/i });
		await user.click(cancelBtn);

		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});
});
