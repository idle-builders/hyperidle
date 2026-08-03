/**
 * AC1 RED — WorkBet outcome section component tests.
 *
 * AC-5:  Outcome data visible on bet detail
 * Design W-2: Inline edit form uses <form> with aria-label="Record bet outcome"
 * Design W-3: aria-label on verdict badges
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { BetDetail } from "../../types/bet";
import { WorkBet } from "../WorkBet";

// Mock the thread and other heavy dependencies
vi.mock("../../shell/HostThreadSection", () => ({
	HostThreadSection: () => <div data-testid="host-thread-section-mock" />,
}));
vi.mock("../../components/ArtifactThreadsSummary", () => ({
	ArtifactThreadsSummary: () => null,
}));
vi.mock("../../hooks/useHostThread", () => ({
	useHostThread: () => ({ data: null, error: null, isLoading: false, refresh: vi.fn() }),
}));

/** Build a minimal BetDetail fixture with optional outcome fields */
function makeBet(overrides?: Partial<BetDetail>): BetDetail {
	return {
		id: "b-test",
		title: "Test Bet",
		team: "Alpha Core",
		status: "completed",
		atRisk: false,
		tokenAppetite: null,
		tokensActual: null,
		progress: { done: 1, total: 1 },
		description: "# Test",
		tasks: [],
		outcomeVerdict: null,
		outcomeSummary: null,
		outcomeRecordedAt: null,
		outcomeRecordedBy: null,
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

describe("WorkBet — Outcome section (AC-5)", () => {
	it("AC-5: renders Outcome section header", () => {
		renderBet(makeBet());
		expect(screen.getByTestId("outcome-section")).toBeInTheDocument();
	});

	it("AC-5: shows 'Not evaluated' when outcomeVerdict is null", () => {
		renderBet(makeBet({ outcomeVerdict: null }));
		expect(screen.getByText(/not evaluated/i)).toBeInTheDocument();
	});

	it("AC-5: shows 'Record outcome' button when not evaluated", () => {
		renderBet(makeBet({ outcomeVerdict: null }));
		expect(screen.getByRole("button", { name: /record outcome/i })).toBeInTheDocument();
	});

	it("AC-5: shows verdict badge when outcomeVerdict is set", () => {
		renderBet(
			makeBet({
				outcomeVerdict: "validated",
				outcomeSummary: "The hypothesis held.",
				outcomeRecordedAt: new Date().toISOString(),
			}),
		);
		expect(screen.getByTestId("outcome-verdict-badge")).toBeInTheDocument();
		expect(screen.getByText(/validated/i)).toBeInTheDocument();
	});

	it("AC-5: shows outcome summary text when populated", () => {
		renderBet(
			makeBet({
				outcomeVerdict: "refuted",
				outcomeSummary: "The hypothesis did not hold.",
				outcomeRecordedAt: new Date().toISOString(),
			}),
		);
		expect(screen.getByText("The hypothesis did not hold.")).toBeInTheDocument();
	});

	it("AC-5: shows 'Edit outcome' button when populated", () => {
		renderBet(
			makeBet({
				outcomeVerdict: "partial",
				outcomeSummary: "Partial results.",
				outcomeRecordedAt: new Date().toISOString(),
			}),
		);
		expect(screen.getByRole("button", { name: /edit outcome/i })).toBeInTheDocument();
	});

	it("Design W-3: verdict badge has aria-label", () => {
		renderBet(
			makeBet({
				outcomeVerdict: "validated",
				outcomeRecordedAt: new Date().toISOString(),
			}),
		);
		const badge = screen.getByTestId("outcome-verdict-badge");
		expect(badge).toHaveAttribute("aria-label");
		expect(badge.getAttribute("aria-label")).toMatch(/outcome/i);
	});

	it("AC-5: clicking 'Record outcome' opens inline edit form", async () => {
		const user = userEvent.setup();
		renderBet(makeBet({ outcomeVerdict: null }));

		await user.click(screen.getByRole("button", { name: /record outcome/i }));

		// Form should be visible
		expect(screen.getByRole("form", { name: /record bet outcome/i })).toBeInTheDocument();
	});

	it("Design W-2: inline edit form has aria-label='Record bet outcome'", async () => {
		const user = userEvent.setup();
		renderBet(makeBet({ outcomeVerdict: null }));

		await user.click(screen.getByRole("button", { name: /record outcome/i }));

		const form = screen.getByRole("form", { name: /record bet outcome/i });
		expect(form).toBeInTheDocument();
	});

	it("AC-5: clicking 'Edit outcome' opens inline edit form with existing values", async () => {
		const user = userEvent.setup();
		renderBet(
			makeBet({
				outcomeVerdict: "refuted",
				outcomeSummary: "Existing summary",
				outcomeRecordedAt: new Date().toISOString(),
			}),
		);

		await user.click(screen.getByRole("button", { name: /edit outcome/i }));

		// Form should be visible
		expect(screen.getByRole("form", { name: /record bet outcome/i })).toBeInTheDocument();
		// Existing verdict should be selected
		const select = screen.getByRole("combobox");
		expect(select).toHaveValue("refuted");
	});

	it("AC-5: Cancel button collapses the edit form", async () => {
		const user = userEvent.setup();
		renderBet(makeBet({ outcomeVerdict: null }));

		await user.click(screen.getByRole("button", { name: /record outcome/i }));
		expect(screen.getByRole("form", { name: /record bet outcome/i })).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: /cancel/i }));
		expect(screen.queryByRole("form", { name: /record bet outcome/i })).not.toBeInTheDocument();
	});
});

describe("WorkBet — Task row outcome badges (AC-5)", () => {
	it("AC-5: task row shows outcome badge when outcomeVerdict is set", () => {
		renderBet(
			makeBet({
				tasks: [
					{
						id: "t1",
						title: "Task with outcome",
						owner: "Agent 1",
						state: "done",
						outcomeVerdict: "met",
					},
				],
			}),
		);
		expect(screen.getByTestId("task-outcome-badge-t1")).toBeInTheDocument();
		expect(screen.getByText("Met")).toBeInTheDocument();
	});

	it("AC-5: task row shows no outcome badge when outcomeVerdict is null", () => {
		renderBet(
			makeBet({
				tasks: [
					{
						id: "t2",
						title: "Task without outcome",
						owner: "Agent 1",
						state: "done",
						outcomeVerdict: null,
					},
				],
			}),
		);
		expect(screen.queryByTestId("task-outcome-badge-t2")).not.toBeInTheDocument();
	});

	it("AC-5: task outcome badge shows correct label mapping", () => {
		renderBet(
			makeBet({
				tasks: [
					{
						id: "t3",
						title: "Task with rework outcome",
						owner: "Agent 1",
						state: "done",
						outcomeVerdict: "met_with_rework",
					},
				],
			}),
		);
		// Label maps met_with_rework -> "Rework"
		expect(screen.getByText("Rework")).toBeInTheDocument();
	});
});
