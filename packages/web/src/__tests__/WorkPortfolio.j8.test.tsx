/**
 * J8 — empty + loading state paths on the Work Portfolio page.
 *
 * @lore U9: WorkPortfolio props (`teams`, `loading`) removed — page now uses
 * useBets() + useTeams() hooks directly. J8 tests updated to use hook mocks
 * instead of component props. Empty state is EmptyState component when bets=[].
 * Loading state renders SkeletonCard components when bets loading=true.
 */
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkPortfolio } from "../pages/WorkPortfolio";

vi.mock("../hooks/useTeams", () => ({
	useTeams: vi.fn().mockReturnValue({ data: null }),
}));

const mockUseBets = vi.fn().mockReturnValue({
	bets: [],
	loading: false,
	error: null,
	refresh: vi.fn(),
});
vi.mock("../hooks/useBets", () => ({
	useBets: (...args: unknown[]) => mockUseBets(...args),
}));

afterEach(() => {
	vi.clearAllMocks();
	mockUseBets.mockReturnValue({
		bets: [],
		loading: false,
		error: null,
		refresh: vi.fn(),
	});
});

function renderPage(): ReturnType<typeof render> {
	return render(
		<MemoryRouter>
			<WorkPortfolio />
		</MemoryRouter>,
	);
}

describe("WorkPortfolio — J8 states", () => {
	it("renders an empty state when no bets exist", () => {
		// Default: bets: [], loading: false
		renderPage();
		expect(screen.getByTestId("portfolio-empty")).toBeInTheDocument();
		// No team-card in the new structure
		expect(screen.queryByTestId("team-card")).not.toBeInTheDocument();
	});

	it("renders skeleton cards when bets are loading", () => {
		mockUseBets.mockReturnValue({
			bets: [],
			loading: true,
			error: null,
			refresh: vi.fn(),
		});
		renderPage();
		// SkeletonCard renders with ariaLabel="Loading bet"
		// The bet-grid is shown in loading state with skeleton cards
		expect(screen.getByTestId("bet-grid")).toBeInTheDocument();
	});
});
