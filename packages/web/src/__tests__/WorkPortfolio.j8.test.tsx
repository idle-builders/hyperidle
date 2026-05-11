/**
 * J8 — empty + loading state paths on the Work Portfolio page.
 */
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { WorkPortfolio } from "../pages/WorkPortfolio";

// M3 G1: mock useProducts so J8 tests that exercise the products prop don't
// race with a real useProducts fetch that might return null.
vi.mock("../hooks/useProducts", () => ({
	useProducts: vi.fn().mockReturnValue({ data: null }),
}));

function renderPage(props: Parameters<typeof WorkPortfolio>[0] = {}): ReturnType<typeof render> {
	return render(
		<MemoryRouter>
			<WorkPortfolio {...props} />
		</MemoryRouter>,
	);
}

describe("WorkPortfolio — J8 states", () => {
	it("renders an empty state when no products are supplied", () => {
		renderPage({ products: [] });
		expect(screen.getByTestId("portfolio-empty")).toBeInTheDocument();
		expect(screen.getByText(/no products in the portfolio/i)).toBeInTheDocument();
		expect(screen.getByText(/add a product from settings/i)).toBeInTheDocument();
		expect(screen.queryByTestId("product-card")).not.toBeInTheDocument();
	});

	it("renders skeleton cards when `loading` is true", () => {
		renderPage({ loading: true });
		const skeletons = screen.getAllByRole("status", { name: /loading product/i });
		expect(skeletons.length).toBeGreaterThanOrEqual(3);
	});
});
