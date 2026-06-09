/**
 * AE2 — AppShell onboarding auto-open tests
 *
 * AC-4: A first-time user is guided to a first meaningful action through
 * conversation with the Assistant.
 *
 * Tests:
 * - AppShell with ?onboarding=true opens the assistant (CoC) overlay
 * - The ?onboarding=true query param is removed after opening
 *
 * @lore AE2: Red-phase tests. They fail until Task 4 (add ?onboarding=true
 * handler to AppShell) is implemented. The existing ?settings=open pattern
 * (AppShell.tsx lines 241-253) is the reference for the implementation.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "../layouts/AppShell";

/**
 * Render AppShell with a given initial path.
 * Follows the pattern from AppShell.settings-overlay.test.tsx.
 */
function renderShell(initialPath: string): ReturnType<typeof render> {
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

beforeEach(() => {
	global.fetch = vi.fn().mockResolvedValue({
		ok: true,
		json: () =>
			Promise.resolve({
				conversations: [],
				work: [],
				knowledge: [],
				threads: [],
				nextCursor: null,
				id: "u-test",
				name: "Tester",
				email: "",
				avatarUrl: null,
			}),
	}) as typeof fetch;
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("AE2 — AppShell ?onboarding=true auto-open", () => {
	// AC-4: ?onboarding=true opens the CoC overlay
	it("opens the CoC/Assistant overlay when ?onboarding=true is in the URL", async () => {
		renderShell("/work/portfolio?onboarding=true");

		// The CocOverlay renders with data-testid="coc-overlay" or similar when open.
		// The overlay is controlled by cocOverlayOpen state in AppShell.
		// It should open automatically because of the ?onboarding=true param.
		await waitFor(
			() => {
				// The overlay should appear — either the CocOverlay dialog or the coc-context-chips section
				// CocOverlay renders nothing when open=false, so any content from it signals it's open
				const overlay =
					screen.queryByTestId("coc-overlay") ??
					screen.queryByTestId("coc-context-chips") ??
					screen.queryByRole("dialog", { name: /assistant/i }) ??
					screen.queryByRole("dialog");
				expect(overlay).not.toBeNull();
			},
			{ timeout: 3000 },
		);
	});

	// AC-4: ?onboarding=true is removed from URL after opening
	it("removes the ?onboarding=true query param after the overlay opens", async () => {
		// Capture URL changes by observing the router
		const router = createMemoryRouter(
			[
				{
					path: "/",
					element: <AppShell />,
					children: [
						{ path: "work/portfolio", element: <div data-testid="portfolio">Portfolio</div> },
						{ path: "conversations", element: <div>Conversations</div> },
					],
				},
			],
			{ initialEntries: ["/work/portfolio?onboarding=true"] },
		);

		render(<RouterProvider router={router} />);

		// Wait for the overlay to open
		await waitFor(
			() => {
				const overlay =
					screen.queryByTestId("coc-overlay") ??
					screen.queryByTestId("coc-context-chips") ??
					screen.queryByRole("dialog");
				expect(overlay).not.toBeNull();
			},
			{ timeout: 3000 },
		);

		// After opening, the ?onboarding param should be removed from the URL
		// The router's current location should not contain "onboarding"
		const currentLocation = router.state.location;
		expect(currentLocation.search).not.toContain("onboarding");
	});

	// Negative: no ?onboarding param → overlay does NOT auto-open
	it("does NOT open the CoC overlay when ?onboarding=true is absent", async () => {
		renderShell("/work/portfolio");

		// Wait for the component to settle
		await waitFor(
			() => {
				expect(screen.getByTestId("main-content")).toBeInTheDocument();
			},
			{ timeout: 3000 },
		);

		// The overlay should NOT be open — CocOverlay returns null when open=false.
		// The dialog should not be present
		const dialog = screen.queryByRole("dialog");
		expect(dialog).toBeNull();
	});

	// Negative: ?settings=open still works (existing behavior unaffected)
	it("?settings=open still triggers the settings overlay (not broken by AE2 changes)", async () => {
		renderShell("/work/portfolio?settings=open");

		await waitFor(
			() => {
				// Settings opens — "Settings" label appears in sidebar when open
				expect(screen.getAllByText("Settings").length).toBeGreaterThanOrEqual(1);
			},
			{ timeout: 3000 },
		);
	});
});
