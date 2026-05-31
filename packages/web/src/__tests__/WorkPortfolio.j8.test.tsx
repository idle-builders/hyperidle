/**
 * J8 — empty + loading state paths on the Work Portfolio page.
 */
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { WorkPortfolio } from "../pages/WorkPortfolio";

// M3 G1: mock useTeams so J8 tests that exercise the products prop don't
// race with a real useTeams fetch that might return null.
vi.mock("../hooks/useTeams", () => ({
	useTeams: vi.fn().mockReturnValue({ data: null }),
}));

function renderPage(props: Parameters<typeof WorkPortfolio>[0] = {}): ReturnType<typeof render> {
	return render(
		<MemoryRouter>
			<WorkPortfolio {...props} />
		</MemoryRouter>,
	);
}

// @lore U5: `products` prop renamed to `teams`; strings updated to match new copy.
describe("WorkPortfolio — J8 states", () => {
	it("renders an empty state when no teams are supplied", () => {
		renderPage({ teams: [] });
		expect(screen.getByTestId("portfolio-empty")).toBeInTheDocument();
		expect(screen.getByText(/no teams in the portfolio/i)).toBeInTheDocument();
		expect(screen.getByText(/create your first team/i)).toBeInTheDocument();
		expect(screen.queryByTestId("team-card")).not.toBeInTheDocument();
	});

	it("renders skeleton cards when `loading` is true", () => {
		renderPage({ loading: true });
		const skeletons = screen.getAllByRole("status", { name: /loading team/i });
		expect(skeletons.length).toBeGreaterThanOrEqual(3);
	});
});
