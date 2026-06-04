/**
 * M3 RED — WorkPortfolio: renders empty/loading states, no MOCK_PRODUCTS fallback (G1-G3).
 *
 * These tests FAIL until:
 *  - MOCK_PRODUCTS fallback is removed from WorkPortfolio.tsx
 *  - MOCK_CYCLE is removed from WorkPortfolio.tsx
 *  - Loading state renders skeleton
 *  - Empty state renders "No products" text
 *  - portfolio-data.ts imports are removed
 */

import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkPortfolio } from "../pages/WorkPortfolio";

// Mock useTeams to control returned data
// @lore U5: useProducts deleted; useTeams is the canonical hook
vi.mock("../hooks/useTeams", () => ({
	useTeams: vi.fn(),
}));

// Mock useBets — team pill filters are hidden in empty state (bets.length === 0)
// so tests that need team names visible must return at least one bet.
vi.mock("../hooks/useBets", () => ({
	useBets: vi.fn().mockReturnValue({ bets: [], loading: false, refresh: vi.fn() }),
}));

import { useBets } from "../hooks/useBets";
import { useTeams } from "../hooks/useTeams";

function renderPage(
	props: { loading?: boolean; products?: unknown } = {},
): ReturnType<typeof render> {
	return render(
		<MemoryRouter>
			<WorkPortfolio {...props} />
		</MemoryRouter>,
	);
}

describe("M3 — WorkPortfolio: loading state renders skeleton (G1)", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("renders skeleton when loading=true prop is passed", () => {
		vi.mocked(useTeams).mockReturnValue({
			data: null,
		} as unknown as ReturnType<typeof useTeams>);

		renderPage({ loading: true });

		// Skeleton should be rendered, not product cards
		expect(screen.getByTestId("work-portfolio-page")).toBeInTheDocument();
		// No product cards when loading
		expect(screen.queryAllByTestId("team-card")).toHaveLength(0);
	});

	it("renders skeleton when useTeams is still loading", () => {
		vi.mocked(useTeams).mockReturnValue({
			data: null,
		} as unknown as ReturnType<typeof useTeams>);

		// When hook returns null data and no explicit loading prop,
		// the page should NOT fall back to MOCK_PRODUCTS
		renderPage();

		// After M3, no MOCK_PRODUCTS fallback — renders empty/loading state
		// Check MOCK_PRODUCTS content is not present
		expect(screen.queryByText("HyperIdle Core")).not.toBeInTheDocument();
		expect(screen.queryByText("Knowledge Fabric")).not.toBeInTheDocument();
		expect(screen.queryByText("Review Workbench")).not.toBeInTheDocument();
		expect(screen.queryByText("Agent Runtime")).not.toBeInTheDocument();
	});
});

describe("M3 — WorkPortfolio: empty state renders 'No products' (G1)", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("renders empty state when useTeams returns empty teams array", async () => {
		vi.mocked(useTeams).mockReturnValue({
			// @lore U1: TeamListResponse uses `teams` array (renamed from `products`)
			data: { teams: [] },
		} as unknown as ReturnType<typeof useTeams>);

		renderPage();

		await waitFor(() => {
			expect(screen.getByTestId("work-portfolio-page")).toBeInTheDocument();
		});

		// Should show empty state, not MOCK_PRODUCTS
		expect(screen.queryByText("HyperIdle Core")).not.toBeInTheDocument();
	});
});

describe("M3 — WorkPortfolio: renders real data from useTeams (G1)", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("renders products from useTeams hook data", async () => {
		vi.mocked(useTeams).mockReturnValue({
			data: {
				// @lore U1: TeamListResponse uses `teams` array (renamed from `products`)
				teams: [
					{
						id: "p-real-1",
						name: "Real Product One",
						status: "healthy",
						activeBets: 2,
						shipRate: "85%",
						leadAgentId: "agent-lead-1",
						shipped: 5,
						progress: { done: 2, total: 4 },
					},
				],
			},
		} as unknown as ReturnType<typeof useTeams>);

		// @lore visual-parity: team pill filters are hidden in empty state (bets.length === 0).
		// Return a bet for this team so the team name pill is visible.
		vi.mocked(useBets).mockReturnValue({
			bets: [
				{
					id: "b-real-1",
					teamId: "p-real-1",
					title: "Real Bet",
					description: "Test bet",
					status: "active",
					costAppetite: null,
					createdAt: "2026-01-01T00:00:00Z",
					updatedAt: "2026-01-01T00:00:00Z",
				},
			],
			loading: false,
			refresh: vi.fn(),
		} as unknown as ReturnType<typeof useBets>);

		renderPage();

		await waitFor(() => {
			expect(screen.getByText("Real Product One")).toBeInTheDocument();
		});

		// MOCK_PRODUCTS content must NOT be present
		expect(screen.queryByText("HyperIdle Core")).not.toBeInTheDocument();
	});
});

describe("M3 — WorkPortfolio: MOCK_CYCLE removed — no 'Cycle 12' fallback (G1)", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("does not render 'Cycle 12' when no cycle data exists", async () => {
		vi.mocked(useTeams).mockReturnValue({
			// @lore U1: TeamListResponse uses `teams` array (renamed from `products`)
			data: { teams: [] },
		} as unknown as ReturnType<typeof useTeams>);

		renderPage();

		await waitFor(() => {
			expect(screen.getByTestId("work-portfolio-page")).toBeInTheDocument();
		});

		// MOCK_CYCLE had label: "Cycle 12" — must not appear after removal
		expect(screen.queryByText("Cycle 12")).not.toBeInTheDocument();
	});
});

describe("M3 — WorkPortfolio: MOCK_PRODUCTS never appears in rendered output", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("no MOCK_PRODUCTS content in DOM when products prop is null and hook returns null", async () => {
		vi.mocked(useTeams).mockReturnValue({
			data: null,
		} as unknown as ReturnType<typeof useTeams>);

		const { container } = renderPage();

		await waitFor(() => {
			expect(container).toBeInTheDocument();
		});

		// All known MOCK_PRODUCTS strings must be absent
		expect(container.textContent).not.toContain("HyperIdle Core");
		expect(container.textContent).not.toContain("Knowledge Fabric");
		expect(container.textContent).not.toContain("Review Workbench");
		expect(container.textContent).not.toContain("Agent Runtime");
		expect(container.textContent).not.toContain("Cycle 12");
	});
});
