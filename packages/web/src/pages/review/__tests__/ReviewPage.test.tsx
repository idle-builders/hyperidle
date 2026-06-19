import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ReviewPage } from "../ReviewPage.js";
import { REVIEW_COMPOSITION_SUBJECT } from "../review-composition.fixture.js";

describe("ReviewPage route", () => {
	function renderRoute(loader?: () => Promise<typeof REVIEW_COMPOSITION_SUBJECT>) {
		const router = createMemoryRouter(
			[
				{
					path: "/work/bet/:betId/review/:reviewId",
					element: <ReviewPage loader={loader} />,
				},
			],
			{ initialEntries: ["/work/bet/bet-123/review/rev-1"] },
		);
		return render(<RouterProvider router={router} />);
	}

	it("loads the review subject and renders the composition", async () => {
		const loader = vi.fn().mockResolvedValue(REVIEW_COMPOSITION_SUBJECT);
		renderRoute(loader);

		await waitFor(() => {
			expect(screen.getByText(`“${REVIEW_COMPOSITION_SUBJECT.prompt}”`)).toBeInTheDocument();
		});
		expect(loader).toHaveBeenCalledWith({ reviewId: "rev-1", betId: "bet-123" });
	});

	it("shows a loading state while the subject is being fetched", () => {
		const loader = vi.fn().mockImplementation(() => new Promise(() => {}));
		renderRoute(loader);

		expect(screen.getByText(/loading review/i)).toBeInTheDocument();
	});

	it("shows an error state when the fetch fails", async () => {
		const loader = vi.fn().mockRejectedValue(new Error("boom"));
		renderRoute(loader);

		await waitFor(() => {
			expect(screen.getByText(/could not load review/i)).toBeInTheDocument();
		});
	});
});
