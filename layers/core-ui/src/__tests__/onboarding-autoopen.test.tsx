/**
 * AppShell onboarding auto-open tests.
 *
 * A first-time user is guided to a first meaningful action through
 * conversation with the Assistant:
 * - AppShell with ?onboarding=true opens the assistant overlay
 * - The ?onboarding=true query param is removed after opening
 *
 * @lore: The existing ?settings=open pattern (AppShell.tsx) is the reference for this implementation.
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
					{ path: "work", element: <div>Work Overview Page</div> },
					{ path: "work/portfolio", element: <div>Portfolio Page (redirects to /work)</div> },
					{ path: "work/team", element: <div>Team Page</div> },
					{ path: "documents", element: <div>Document Page</div> },
					// @lore: /settings is now a real route — stub avoids 404 error.
					{ path: "settings", element: <div>Settings</div> },
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
				documents: [],
				threads: [],
				nextCursor: null,
				id: "u-test",
				name: "Tester",
				avatarUrl: null,
			}),
	}) as typeof fetch;
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("AppShell ?onboarding=true auto-open", () => {
	// ?onboarding=true opens the assistant overlay
	it("opens the CoC/Assistant overlay when ?onboarding=true is in the URL", async () => {
		// navigate to /work?onboarding=true (was /work/portfolio?onboarding=true)
		renderShell("/work?onboarding=true");

		// The AssistantOverlay renders with data-testid="coc-overlay" or similar when open.
		// The overlay is controlled by assistantOverlayOpen state in AppShell.
		// It should open automatically because of the ?onboarding=true param.
		await waitFor(
			() => {
				// The overlay should appear — either the AssistantOverlay dialog or the assistant-context-chips section
				// AssistantOverlay renders nothing when open=false, so any content from it signals it's open
				const overlay =
					screen.queryByTestId("coc-overlay") ??
					screen.queryByTestId("assistant-context-chips") ??
					screen.queryByRole("dialog", { name: /assistant/i }) ??
					screen.queryByRole("dialog");
				expect(overlay).toBeInTheDocument();
			},
			{ timeout: 3000 },
		);
	});

	// AC-4: ?onboarding=true is removed from URL after opening
	it("removes the ?onboarding=true query param after the overlay opens", async () => {
		// Capture URL changes by observing the router
		// /work?onboarding=true (was /work/portfolio?onboarding=true)
		const router = createMemoryRouter(
			[
				{
					path: "/",
					element: <AppShell />,
					children: [
						{ path: "work", element: <div data-testid="portfolio">Work Overview</div> },
						{ path: "conversations", element: <div>Conversations</div> },
						{ path: "settings", element: <div>Settings</div> },
					],
				},
			],
			{ initialEntries: ["/work?onboarding=true"] },
		);

		render(<RouterProvider router={router} />);

		// Wait for the overlay to open
		await waitFor(
			() => {
				const overlay =
					screen.queryByTestId("coc-overlay") ??
					screen.queryByTestId("assistant-context-chips") ??
					screen.queryByRole("dialog");
				expect(overlay).toBeInTheDocument();
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
		// /work (was /work/portfolio)
		renderShell("/work");

		// Wait for the component to settle
		await waitFor(
			() => {
				expect(screen.getByTestId("main-content")).toBeInTheDocument();
			},
			{ timeout: 3000 },
		);

		// The overlay should NOT be open — AssistantOverlay returns null when open=false.
		// The dialog should not be present
		const dialog = screen.queryByRole("dialog");
		expect(dialog).toBeNull();
	});

	// Negative: ?settings=open still works (existing behavior unaffected)
	it("?settings=open still triggers the settings overlay", async () => {
		// /work (was /work/portfolio)
		renderShell("/work?settings=open");

		await waitFor(
			() => {
				// Settings opens — "Settings" label appears in sidebar when open
				expect(screen.getAllByText("Settings").length).toBeGreaterThanOrEqual(1);
			},
			{ timeout: 3000 },
		);
	});
});
