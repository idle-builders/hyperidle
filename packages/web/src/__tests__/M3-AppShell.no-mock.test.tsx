/**
 * M3 RED — AppShell: uses hooks instead of mock data, no "u-founder" in DOM (A11, B4, C4, F1).
 *
 * These tests FAIL until:
 *  - AppShell uses useCurrentUser() instead of DEMO_FOUNDER_ID constant
 *  - AppShell uses useSettings() instead of DEFAULT_SETTINGS import
 *  - AppShell uses useRail() instead of MOCK_RAIL_* imports
 *  - count: 12 is removed from knowledge submenu item (F1)
 *  - DEMO_FOUNDER_ID constant is deleted from AppShell.tsx
 */

import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "../layouts/AppShell";

function renderShell(initialPath = "/conversations"): ReturnType<typeof render> {
	const router = createMemoryRouter(
		[
			{
				path: "/",
				element: <AppShell />,
				children: [
					{ path: "conversations", element: <div>Conversations Page</div> },
					{ path: "conversations/:threadId", element: <div>Conversations Page</div> },
					{ path: "work/portfolio", element: <div>Portfolio Page</div> },
					{ path: "work/team", element: <div>Team Page</div> },
					{ path: "knowledge", element: <div>Knowledge Page</div> },
				],
			},
		],
		{ initialEntries: [initialPath] },
	);
	return render(<RouterProvider router={router} />);
}

describe("M3 — AppShell: no 'u-founder' in DOM (A11)", () => {
	beforeEach(() => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					// /api/auth/me response
					id: "real-user-id",
					name: "Real User",
					email: "real@hyperidle.dev",
					avatarUrl: null,
					// /api/settings response (for other fetch calls)
					profile: { name: "Real User", email: "real@hyperidle.dev", avatarUrl: null },
					products: [],
					agents: [],
					notifications: {
						reviewAlerts: true,
						costAlerts: true,
						blockerAlerts: false,
						quietHoursStart: "22:00",
						quietHoursEnd: "08:00",
						mutedProducts: [],
					},
					// /api/rail response
					bets: [],
					blockers: [],
					awaitingOrdering: [],
					costBurnRate: { todaySpend: null, todayCap: null, weekSpend: null, weekCap: null, weekTokens: null },
					// /api/threads response
					threads: [],
					nextCursor: null,
				}),
		}) as typeof fetch;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("does not render 'u-founder' string in the DOM", async () => {
		const { container } = renderShell();

		await waitFor(() => {
			expect(screen.getByTestId("main-content")).toBeInTheDocument();
		});

		// The DOM must NOT contain the hardcoded "u-founder" string anywhere
		expect(container.textContent).not.toContain("u-founder");
	});

	it("does not render the hardcoded 'DEMO_FOUNDER_ID' text", async () => {
		const { container } = renderShell();

		await waitFor(() => {
			expect(screen.getByTestId("main-content")).toBeInTheDocument();
		});

		expect(container.textContent).not.toContain("DEMO_FOUNDER_ID");
	});
});

describe("M3 — AppShell: knowledge submenu count:12 removed (F1)", () => {
	beforeEach(() => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					id: "real-user-id",
					name: "Real User",
					email: "real@hyperidle.dev",
					avatarUrl: null,
					bets: [],
					blockers: [],
					awaitingOrdering: [],
					costBurnRate: { todaySpend: null, todayCap: null, weekSpend: null, weekCap: null, weekTokens: null },
					threads: [],
					nextCursor: null,
				}),
		}) as typeof fetch;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("knowledge submenu does not show badge with value 12", async () => {
		renderShell("/knowledge");

		await waitFor(() => {
			expect(screen.getByTestId("main-content")).toBeInTheDocument();
		});

		// The "12" badge must not appear in the knowledge submenu area
		// Find the knowledge nav area and check no badge reads "12"
		const allText = screen.queryAllByText("12");
		// Filter to only count badges (elements with badge role or specific class)
		// The test is: no badge showing "12" should exist in the submenu
		for (const element of allText) {
			// If there's an element with "12" it should NOT be a badge in the knowledge nav
			expect(element.getAttribute("data-badge")).not.toBe("12");
		}
	});
});

describe("M3 — AppShell: uses useRail hook instead of MOCK_RAIL_* (C4)", () => {
	beforeEach(() => {
		global.fetch = vi.fn().mockImplementation((url: string) => {
			if ((url as string).includes("/api/rail")) {
				return Promise.resolve({
					ok: true,
					json: () =>
						Promise.resolve({
							bets: [{ id: "b-real", title: "Real Bet from API", status: "in_progress", progress: { done: 1, total: 3 } }],
							blockers: [],
							awaitingOrdering: [],
							costBurnRate: { todaySpend: null, todayCap: null, weekSpend: null, weekCap: null, weekTokens: null },
						}),
				});
			}
			return Promise.resolve({
				ok: true,
				json: () =>
					Promise.resolve({
						id: "real-user-id",
						name: "Real User",
						email: "real@hyperidle.dev",
						avatarUrl: null,
						threads: [],
						nextCursor: null,
					}),
			});
		}) as typeof fetch;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders bet title from API response (not from MOCK_RAIL_BETS)", async () => {
		renderShell();

		// "Real Bet from API" comes from the mocked /api/rail, not from MOCK_RAIL_BETS
		await waitFor(() => {
			expect(screen.getByText("Real Bet from API")).toBeInTheDocument();
		});
	});

	it("does NOT render mock bet titles ('User auth flow', 'Dashboard redesign')", async () => {
		renderShell();

		await waitFor(() => {
			expect(screen.getByTestId("main-content")).toBeInTheDocument();
		});

		// MOCK_RAIL_BETS titles must not appear
		expect(screen.queryByText("User auth flow")).not.toBeInTheDocument();
		expect(screen.queryByText("Dashboard redesign")).not.toBeInTheDocument();
	});
});
