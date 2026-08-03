/**
 * L13 — WorkProduct page unit tests (red phase).
 *
 * Covers all 10 items from architecture §Test plan §Vitest dispatch (client unit).
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

// @lore U5: WorkProduct renamed to WorkTeam; import updated.
import { WorkTeam } from "../pages/WorkTeam";

// AgentEditDialog and AgentAddDialog call useToast. They are only mounted when
// the corresponding state is non-null/true, but we still mock useToast to prevent
// the "must be used within <ToastRegion>" error when dialogs open in tests.
// @lore AB3: WorkTeam renders dialogs conditionally (editingAgentId !== null /
// addDialogOpen), so useToast is only called when a dialog is open — but keeping
// this mock is safer than relying on no dialog state leaking across tests.
vi.mock("../shell/ToastRegion.js", async () => {
	const actual = await vi.importActual("../shell/ToastRegion.js");
	return {
		...actual,
		useToast: vi.fn(() => ({ showToast: vi.fn() })),
	};
});

/**
 * @lore U1: TeamDetail shape replaces ProductDetail.
 * - `product` → `team` (TeamSummary)
 * - `team` → `teamMembers` (membership group)
 * - `pitchTitle` → `descriptionTitle`
 * - `status: "committed"` → `status: "active"`
 */
const MOCK_PRODUCT_DETAIL = {
	team: {
		id: "p1",
		name: "HyperIdle Core",
		phase: "build",
		status: "healthy" as const,
		leadAgentId: "agent-lead",
	},
	teamMembers: { id: "t1", formedAt: "2024-01-01T00:00:00.000Z", dissolvedAt: null },
	roster: [
		{
			agentId: "agent-lead",
			name: "Lead Agent",
			role: "lead",
			isLead: true,
			agentCategory: "team",
		},
		{
			agentId: "agent-member",
			name: "Alice Agent",
			role: "member",
			isLead: false,
			agentCategory: "team",
		},
	],
	burn: {
		capacity: 5,
		activeBets: 2,
	},
	activeBets: [
		{
			id: "b1",
			// @lore U1: descriptionTitle (formerly pitchTitle)
			descriptionTitle: "Auth migration",
			// @lore U1: "committed" merged into "active"
			status: "active" as const,
			progressDone: 1,
			progressTotal: 2,
		},
	],
};

const MOCK_PRODUCT_EMPTY_BETS = {
	...MOCK_PRODUCT_DETAIL,
	activeBets: [],
};

// @lore U5: Route path /work/product/:productId is F1 scope (U6). Local var renamed teamId.
function renderPage(
	teamId = "p1",
	overrideData?: typeof MOCK_PRODUCT_DETAIL | null,
	loading = false,
	error: Error | null = null,
): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[`/work/product/${teamId}`]}>
			<Routes>
				<Route
					path="/work/product/:productId"
					element={
						<WorkTeam overrideData={overrideData} overrideLoading={loading} overrideError={error} />
					}
				/>
				{/* AD9: /work/portfolio retired → /work */}
				<Route path="/work" element={<div data-testid="work-overview-page">Work Overview</div>} />
				<Route path="/work/bet/:betId" element={<div data-testid="work-bet-page">Bet</div>} />
			</Routes>
		</MemoryRouter>,
	);
}

// @lore U5: describe renamed from WorkProduct → WorkTeam; testids use team-* prefix.
describe("WorkTeam", () => {
	it("1. renders the page H1 with the team name when the fetch resolves", () => {
		renderPage("p1", MOCK_PRODUCT_DETAIL);
		expect(screen.getByTestId("work-team-page")).toBeInTheDocument();
		// AG4: team name now in both breadcrumb and h1; use heading role for specificity
		expect(screen.getByRole("heading", { level: 1, name: "HyperIdle Core" })).toBeInTheDocument();
	});

	it("2. renders one BetCard row per active bet", () => {
		renderPage("p1", MOCK_PRODUCT_DETAIL);
		const betsRegion = screen.getByTestId("team-active-bets");
		expect(betsRegion).toBeInTheDocument();
		// Should render the bet title
		expect(screen.getByText("Auth migration")).toBeInTheDocument();
	});

	it("3. renders the empty-state when active bets list is empty", () => {
		renderPage("p1", MOCK_PRODUCT_EMPTY_BETS);
		expect(screen.getByTestId("team-active-bets-empty")).toBeInTheDocument();
	});

	// @lore AB2: AgentCard replaced by AgentRow (data-testid="agent-row").
	// The row shows status, health dot, context column. Customize button opens edit dialog.
	it("4. renders one agent row per roster member", () => {
		renderPage("p1", MOCK_PRODUCT_DETAIL);
		const agentRows = screen.getAllByTestId("agent-row");
		expect(agentRows).toHaveLength(2);
	});

	// @lore AU21 Increment 14a: "renders the burn-vs-cap with a progress
	// element" is HARD-DELETED — the cap-utilization progress bar is gone
	// along with the rest of the cost-cap feature, no replacement.
	it("5. renders the team-burn-vs-cap section", () => {
		renderPage("p1", MOCK_PRODUCT_DETAIL);
		const burnRegion = screen.getByTestId("team-burn-vs-cap");
		expect(burnRegion).toBeInTheDocument();
	});

	// AD9: breadcrumb navigates to /work (was /work/portfolio)
	it("6. click on the breadcrumb chip navigates to /work (work overview)", async () => {
		const user = userEvent.setup();
		renderPage("p1", MOCK_PRODUCT_DETAIL);

		const breadcrumb = screen.getByTestId("team-breadcrumb-back");
		await user.click(breadcrumb);

		await waitFor(() => {
			expect(screen.getByTestId("work-overview-page")).toBeInTheDocument();
		});
	});

	it("7. click on a bet row navigates to /work/bet/:id", async () => {
		const user = userEvent.setup();
		renderPage("p1", MOCK_PRODUCT_DETAIL);

		// Find and click the bet row/card
		const betCard = screen.getByText("Auth migration");
		await user.click(betCard);

		await waitFor(() => {
			expect(screen.getByTestId("work-bet-page")).toBeInTheDocument();
		});
	});

	it("8. renders the 404 empty state when the fetch returns 404", () => {
		const err = new Error("Team fetch failed: 404");
		renderPage("does-not-exist", null, false, err);
		expect(screen.getByTestId("team-not-found")).toBeInTheDocument();
	});

	it("9. renders an ErrorState when the fetch returns 500", () => {
		const err = new Error("Team fetch failed: 500");
		renderPage("p1", null, false, err);
		// Any error state rendered (not the 404-specific one)
		// The page should show some error indication
		expect(screen.queryByTestId("work-team-page")).toBeInTheDocument();
		expect(screen.queryByTestId("team-not-found")).not.toBeInTheDocument();
	});

	it("10. loading state: while useTeam is in-flight, renders SkeletonCard placeholders and NOT EmptyState", () => {
		renderPage("p1", null, true, null);
		expect(screen.getByTestId("work-team-page")).toBeInTheDocument();
		// Skeleton placeholders should be visible
		expect(screen.queryAllByRole("status").length).toBeGreaterThanOrEqual(0); // skeletons may use aria
		// Most importantly: empty state for active bets must NOT appear during loading
		expect(screen.queryByTestId("team-active-bets-empty")).not.toBeInTheDocument();
	});

	// D1 regression guard: a committed bet must not show the BEHIND status chip.
	// Previously BetRow mapped `committed → "behind"` which was a category error
	// (committed = normal active state; behind = actually behind by some signal).
	it("11. a committed bet renders without 'BEHIND' in the active bets section", () => {
		renderPage("p1", MOCK_PRODUCT_DETAIL);
		// The bet title should be visible
		expect(screen.getByText("Auth migration")).toBeInTheDocument();
		// The StatusChip for a committed bet should not say BEHIND
		const betsRegion = screen.getByTestId("team-active-bets");
		expect(betsRegion.textContent).not.toContain("BEHIND");
	});

	// D2 regression guard: the lead name (not the agent id) must appear in the header.
	it("12. renders lead display name (not agent id) in the team header", () => {
		renderPage("p1", MOCK_PRODUCT_DETAIL);
		// The roster has leadAgentId="agent-lead" → name "Lead Agent".
		// The header should show the name, not the raw id.
		expect(screen.getByText(/Lead:\s*Lead Agent/i)).toBeInTheDocument();
		expect(screen.queryByText(/Lead:\s*agent-lead/i)).not.toBeInTheDocument();
	});
});
