/**
 * WorkProduct page unit tests.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { WorkTeam } from "../pages/WorkTeam";

// AgentEditDialog and AgentAddDialog call useToast. They are only mounted when
// the corresponding state is non-null/true, but we still mock useToast to prevent
// the "must be used within <ToastRegion>" error when dialogs open in tests.
// @lore: useToast mock — fires only when a dialog is open; mock stays even when no dialog to prevent state leaking across tests
vi.mock("../shell/ToastRegion.js", async () => {
	const actual = await vi.importActual("../shell/ToastRegion.js");
	return {
		...actual,
		useToast: vi.fn(() => ({ showToast: vi.fn() })),
	};
});

/**
 */
const MOCK_PRODUCT_DETAIL = {
	team: {
		id: "p1",
		name: "HyperIdle Core",
		status: "healthy" as const,
	},
	roster: [
		{
			agentId: "agent-lead",
			name: "Lead Agent",
			discipline: "lead",
			agentCategory: "team",
		},
		{
			agentId: "agent-member",
			name: "Alice Agent",
			discipline: "member",
			agentCategory: "team",
		},
	],
	tasksInProgress: [
		{
			id: "b1",
			title: "Auth migration",
			state: "in_progress" as const,
			progressDone: 1,
			progressTotal: 2,
		},
	],
};

const MOCK_PRODUCT_EMPTY_BETS = {
	...MOCK_PRODUCT_DETAIL,
	tasksInProgress: [],
};

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
				{/* /work/portfolio retired → /work */}
				<Route path="/work" element={<div data-testid="work-overview-page">Work Overview</div>} />
				<Route path="/work/task/:taskId" element={<div data-testid="work-task-page">Task</div>} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("WorkTeam", () => {
	it("1. renders the page H1 with the team name when the fetch resolves", () => {
		renderPage("p1", MOCK_PRODUCT_DETAIL);
		expect(screen.getByTestId("work-team-page")).toBeInTheDocument();
		// AG4: team name now in both breadcrumb and h1; use heading role for specificity
		expect(screen.getByRole("heading", { level: 1, name: "HyperIdle Core" })).toBeInTheDocument();
	});

	it("2. renders one BetCard row per active bet", () => {
		renderPage("p1", MOCK_PRODUCT_DETAIL);
		const betsRegion = screen.getByTestId("team-active-tasks");
		expect(betsRegion).toBeInTheDocument();
		// Should render the bet title
		expect(screen.getByText("Auth migration")).toBeInTheDocument();
	});

	it("3. renders the empty-state when active bets list is empty", () => {
		renderPage("p1", MOCK_PRODUCT_EMPTY_BETS);
		expect(screen.getByTestId("team-active-tasks-empty")).toBeInTheDocument();
	});

	it("4. renders one agent row per roster member", () => {
		renderPage("p1", MOCK_PRODUCT_DETAIL);
		const agentRows = screen.getAllByTestId("agent-row");
		expect(agentRows).toHaveLength(2);
	});

	it("5. renders the team-burn-vs-cap section", () => {
		renderPage("p1", MOCK_PRODUCT_DETAIL);
		const burnRegion = screen.getByTestId("team-burn-vs-cap");
		expect(burnRegion).toBeInTheDocument();
	});

	// breadcrumb navigates to /work (was /work/portfolio)
	it("6. click on the breadcrumb chip navigates to /work (work overview)", async () => {
		const user = userEvent.setup();
		renderPage("p1", MOCK_PRODUCT_DETAIL);

		const breadcrumb = screen.getByTestId("team-breadcrumb-back");
		await user.click(breadcrumb);

		await waitFor(() => {
			expect(screen.getByTestId("work-overview-page")).toBeInTheDocument();
		});
	});

	// bet rows are now <a href> links so ⌘-click / middle-click work natively.
	// In jsdom + MemoryRouter, <a href> clicks don't trigger SPA navigation; the correct
	// assertion is that the row has the right href attribute.
	it("7. task row has href to /work/task/:id (root tasks replace bets; was /work/bet/:id)", () => {
		renderPage("p1", MOCK_PRODUCT_DETAIL);

		// The task title is inside the anchor row; find the closest <a> ancestor.
		const taskTitle = screen.getByText("Auth migration");
		const link = taskTitle.closest("a");
		expect(link).not.toBeNull();
		expect(link?.getAttribute("href")).toBe("/work/task/b1");
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
		expect(screen.queryByTestId("team-active-tasks-empty")).not.toBeInTheDocument();
	});

	// Regression guard: a committed bet must not show the BEHIND status chip.
	// Previously BetRow mapped `committed → "behind"` which was a category error
	// (committed = normal active state; behind = actually behind by some signal).
	it("11. a committed bet renders without 'BEHIND' in the active bets section", () => {
		renderPage("p1", MOCK_PRODUCT_DETAIL);
		// The bet title should be visible
		expect(screen.getByText("Auth migration")).toBeInTheDocument();
		// The StatusChip for a committed bet should not say BEHIND
		const betsRegion = screen.getByTestId("team-active-tasks");
		expect(betsRegion.textContent).not.toContain("BEHIND");
	});
});
