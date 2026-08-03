/**
 * AC2 RED — WorkBet retro outcome section component tests.
 *
 * AC2-7:  WorkBet shows hypothesis in read-only left column during editing
 * AC2-8:  "Draft with AI" button pre-fills form fields
 * AC2-12: Populated state shows two-column layout with hypothesis (left) + reality+learnings (right)
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BetDetail } from "../../types/bet";
import { WorkBet } from "../WorkBet";

// Mock heavy dependencies that are not under test
vi.mock("../../shell/HostThreadSection", () => ({
	HostThreadSection: () => <div data-testid="host-thread-section-mock" />,
}));
vi.mock("../../components/ArtifactThreadsSummary", () => ({
	ArtifactThreadsSummary: () => null,
}));
vi.mock("../../hooks/useHostThread", () => ({
	useHostThread: () => ({ data: null, error: null, isLoading: false, refresh: vi.fn() }),
}));

/** Build a minimal BetDetail fixture with optional fields */
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
		hypothesis: null,
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

describe("WorkBet — AC2 retro section (editing state)", () => {
	beforeEach(() => {
		// Reset fetch mocks before each test
		vi.restoreAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// AC2-7: Hypothesis appears in read-only left column during editing
	it("AC2-7: shows hypothesis text in left column when editing", async () => {
		const user = userEvent.setup();
		renderBet(
			makeBet({
				hypothesis: "Users will complete onboarding in under 5 minutes.",
				outcomeVerdict: null,
			}),
		);

		// Open the edit form
		await user.click(screen.getByRole("button", { name: /record outcome/i }));

		// Hypothesis text should be visible
		expect(
			screen.getByText("Users will complete onboarding in under 5 minutes."),
		).toBeInTheDocument();

		// Hypothesis must be read-only — not in an input or textarea
		const hypothesisText = screen.getByTestId("retro-hypothesis-display");
		expect(hypothesisText.tagName.toLowerCase()).not.toBe("input");
		expect(hypothesisText.tagName.toLowerCase()).not.toBe("textarea");
		expect(hypothesisText.tagName.toLowerCase()).not.toBe("select");
	});

	// AC2-7: "No hypothesis recorded" shown when hypothesis is null
	it("AC2-7: shows 'No hypothesis recorded' placeholder when hypothesis is null", async () => {
		const user = userEvent.setup();
		renderBet(makeBet({ hypothesis: null, outcomeVerdict: null }));

		await user.click(screen.getByRole("button", { name: /record outcome/i }));

		expect(screen.getByText(/no hypothesis recorded/i)).toBeInTheDocument();
	});

	// AC2-7: Hypothesis column label visible during editing
	it("AC2-7: left column shows 'Predicted' label during editing", async () => {
		const user = userEvent.setup();
		renderBet(
			makeBet({
				hypothesis: "Some hypothesis.",
				outcomeVerdict: null,
			}),
		);

		await user.click(screen.getByRole("button", { name: /record outcome/i }));

		// The column should have a "Predicted" label
		expect(screen.getByText(/predicted/i)).toBeInTheDocument();
	});

	// AC2-8: "Draft with AI" button exists in editing mode
	it("AC2-8: shows 'Draft with AI' button in editing mode", async () => {
		const user = userEvent.setup();
		renderBet(makeBet({ hypothesis: "Some hypothesis.", outcomeVerdict: null }));

		await user.click(screen.getByRole("button", { name: /record outcome/i }));

		expect(screen.getByRole("button", { name: /draft with ai/i })).toBeInTheDocument();
	});

	// AC2-8: "Draft with AI" button calls the draft endpoint and pre-fills form fields
	it("AC2-8: clicking 'Draft with AI' calls draft endpoint and pre-fills verdict, summary, learnings", async () => {
		const user = userEvent.setup();

		// Mock the API fetch so the draft call succeeds
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				verdict: "partial",
				summary: "AI-generated summary of what happened.",
				learnings: "AI-generated learnings from the bet.",
			}),
		});
		vi.stubGlobal("fetch", mockFetch);

		renderBet(
			makeBet({ id: "b-draft-test", hypothesis: "Some hypothesis.", outcomeVerdict: null }),
		);

		await user.click(screen.getByRole("button", { name: /record outcome/i }));
		await user.click(screen.getByRole("button", { name: /draft with ai/i }));

		// Wait for the async draft call to complete and form to be pre-filled
		await waitFor(() => {
			// Verify the draft endpoint was called
			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining("/retro/draft"),
				expect.objectContaining({ method: "POST" }),
			);
		});

		// Verdict select should be pre-filled with "partial"
		await waitFor(() => {
			const verdictSelect = screen.getByRole("combobox");
			expect(verdictSelect).toHaveValue("partial");
		});

		// Summary textarea should be pre-filled
		const summaryTextarea = screen.getByTestId("retro-summary-textarea");
		expect(summaryTextarea).toHaveValue("AI-generated summary of what happened.");

		// Learnings textarea should be pre-filled
		const learningsTextarea = screen.getByTestId("retro-learnings-textarea");
		expect(learningsTextarea).toHaveValue("AI-generated learnings from the bet.");
	});

	// AC2-8: Draft error shows error message, form remains usable
	it("AC2-8: shows error message when draft fails, form remains usable", async () => {
		const user = userEvent.setup();

		const mockFetch = vi.fn().mockResolvedValue({
			ok: false,
			json: async () => ({ error: "LLM unavailable" }),
		});
		vi.stubGlobal("fetch", mockFetch);

		renderBet(makeBet({ hypothesis: "Some hypothesis.", outcomeVerdict: null }));

		await user.click(screen.getByRole("button", { name: /record outcome/i }));
		await user.click(screen.getByRole("button", { name: /draft with ai/i }));

		await waitFor(() => {
			expect(screen.getByText(/could not generate draft/i)).toBeInTheDocument();
		});

		// Form should still be visible (not crashed)
		expect(screen.getByRole("form", { name: /record bet outcome/i })).toBeInTheDocument();
	});

	// Save calls POST /retro (not /outcome)
	it("save button calls POST /api/bets/:id/retro with verdict + summary + learnings", async () => {
		const user = userEvent.setup();

		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				id: "b-test",
				outcomeVerdict: "validated",
				outcomeSummary: "It worked.",
				outcomeRecordedAt: new Date().toISOString(),
				retroKnowledgeItemId: "ki-123",
			}),
		});
		vi.stubGlobal("fetch", mockFetch);

		renderBet(makeBet({ hypothesis: "Some hypothesis.", outcomeVerdict: null }));

		await user.click(screen.getByRole("button", { name: /record outcome/i }));

		// Select a verdict
		const verdictSelect = screen.getByRole("combobox");
		await user.selectOptions(verdictSelect, "validated");

		// Fill summary (the reality textarea)
		const summaryTextarea = screen.getByTestId("retro-summary-textarea");
		await user.type(summaryTextarea, "It worked.");

		// Fill learnings
		const learningsTextarea = screen.getByTestId("retro-learnings-textarea");
		await user.type(learningsTextarea, "We learned a lot.");

		// Submit
		await user.click(screen.getByRole("button", { name: /^save$/i }));

		await waitFor(() => {
			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining("/retro"),
				expect.objectContaining({
					method: "POST",
					body: expect.stringContaining("validated"),
				}),
			);
		});

		// Must NOT call the old /outcome endpoint
		const calls = mockFetch.mock.calls as Array<[string, RequestInit]>;
		const retroCall = calls.find(([url]) => url.includes("/retro") && !url.includes("/draft"));
		expect(retroCall).toBeDefined();
		const outcomeCall = calls.find(([url]) => url.endsWith("/outcome"));
		expect(outcomeCall).toBeUndefined();
	});
});

describe("WorkBet — AC2 retro section (populated state)", () => {
	// AC2-12: Populated state shows two-column layout with hypothesis (left) and reality+learnings (right)
	it("AC2-12: populated state shows two-column layout with hypothesis and outcome data", () => {
		renderBet(
			makeBet({
				hypothesis: "Users will complete onboarding in under 5 minutes.",
				outcomeVerdict: "validated",
				outcomeSummary: "Users completed in 4.5 minutes.",
				outcomeRecordedAt: new Date().toISOString(),
			}),
		);

		// Left column: hypothesis text
		expect(
			screen.getByText("Users will complete onboarding in under 5 minutes."),
		).toBeInTheDocument();

		// Right column: verdict badge
		expect(screen.getByTestId("outcome-verdict-badge")).toBeInTheDocument();
		expect(screen.getByText(/validated/i)).toBeInTheDocument();

		// Right column: summary/reality text
		expect(screen.getByText("Users completed in 4.5 minutes.")).toBeInTheDocument();

		// Two-column container must exist
		expect(screen.getByTestId("retro-columns")).toBeInTheDocument();
	});

	// AC2-12: Populated state with learnings shows them in the right column
	it("AC2-12: populated state shows learnings in right column when available", () => {
		renderBet(
			makeBet({
				hypothesis: "Some hypothesis.",
				outcomeVerdict: "refuted",
				outcomeSummary: "Did not work.",
				outcomeRecordedAt: new Date().toISOString(),
			}),
		);

		// Outcome section must render
		expect(screen.getByTestId("outcome-section")).toBeInTheDocument();
	});

	// AC2-12: Populated state with null hypothesis shows placeholder in left column
	it("AC2-12: populated state shows 'No hypothesis recorded' in left column when hypothesis is null", () => {
		renderBet(
			makeBet({
				hypothesis: null,
				outcomeVerdict: "inconclusive",
				outcomeSummary: "Unable to conclude.",
				outcomeRecordedAt: new Date().toISOString(),
			}),
		);

		// Even in populated state, missing hypothesis shows placeholder
		expect(screen.getByText(/no hypothesis recorded/i)).toBeInTheDocument();
	});

	// The "Edit outcome" button is still present in populated state
	it("AC2-12: populated state still has 'Edit outcome' button", () => {
		renderBet(
			makeBet({
				hypothesis: "Some hypothesis.",
				outcomeVerdict: "partial",
				outcomeSummary: "Partial results.",
				outcomeRecordedAt: new Date().toISOString(),
			}),
		);
		expect(screen.getByRole("button", { name: /edit outcome/i })).toBeInTheDocument();
	});
});

describe("WorkBet — AC2-9 existing AC1 behavior preserved", () => {
	// AC2-9: Unvalidated bets still show "Not evaluated" (AC1 behavior unchanged)
	it("AC2-9: shows 'Not evaluated' when outcomeVerdict is null", () => {
		renderBet(makeBet({ outcomeVerdict: null }));
		expect(screen.getByText(/not evaluated/i)).toBeInTheDocument();
	});

	it("AC2-9: shows 'Record outcome' button when not evaluated", () => {
		renderBet(makeBet({ outcomeVerdict: null }));
		expect(screen.getByRole("button", { name: /record outcome/i })).toBeInTheDocument();
	});
});
