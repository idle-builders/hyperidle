/**
 * M3 RED — AppShell: uses hooks instead of mock data, no "u-founder" in DOM (A11, B4, C4, F1).
 *
 * These tests FAIL until:
 *  - AppShell uses useCurrentUser() instead of DEMO_FOUNDER_ID constant
 *  - AppShell uses useSettings() instead of DEFAULT_SETTINGS import
 *  - count: 12 is removed from knowledge submenu item (F1)
 * @lore AD8a: "useRail() instead of MOCK_RAIL_*" bullet removed — Rail deleted in U6.
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
					teams: [],
					users: [],
					notifications: {
						reviewAlerts: true,
						blockerAlerts: false,
						quietHoursStart: "22:00",
						quietHoursEnd: "08:00",
						mutedTeams: [],
					},
					// @lore AD8a: /api/rail mock stub removed — Rail API deleted in U6.
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

// @lore U6: useRail hook and Rail component were deleted in U6.
// The C4 test ("renders bet title from API response") tested that the AppShell used
// @lore AD8a: historical — useRail() instead of MOCK_RAIL_BETS. Since the Rail component no longer exists,
// the test is no longer applicable. The AppShell now uses a Sidebar with thread list
// @lore AD8a: historical — and team sub-items — there is no bet-title rail in the layout.
