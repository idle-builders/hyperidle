/**
 * J3 — AppShell integration: Settings overlay and Command-K priority.
 *
 * @lore U6: Settings overlay tests updated from J3 (Rail-aware) to U6 (Sidebar-only).
 * @lore AD8a: historical — The Rail component is deleted. The rail-wrapper and "Active Bets" assertions are
 * replaced with Sidebar-based checks. Settings is opened via the Settings button
 * (aria-label="Settings") in the Sidebar bottom strip.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
					// L9: canonical conversation routes.
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

describe("AppShell — Settings overlay + Command-K priority (J3)", () => {
	beforeEach(() => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () =>
				// L8: include `threads` for the Conversations Sidebar hook.
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

	// @lore U6: The Rail is deleted. The old "hides the Rail from the accessibility tree"
	// @lore AD8a: historical — test checked that when settings is open, the Rail has aria-hidden="true".
	// @lore AD8a: historical — In the new design there is no Rail. We verify instead that "Active Bets" text
	// does not appear at all (it no longer exists in the layout).
	// @lore AD8a: historical Rail test
	it("there is no Rail component in the layout (U6: Rail deleted)", async () => {
		// @lore AD8a: Rail deleted in U6
		const user = userEvent.setup();
		renderShell();
		await waitFor(() => {
			expect(screen.getByRole("button", { name: /settings/i })).toBeInTheDocument();
		});
		await user.click(screen.getByRole("button", { name: /settings/i }));
		// Settings is an icon-only persistent shell control.
		await waitFor(() => {
			expect(screen.getByRole("button", { name: /settings/i })).toHaveAttribute(
				"aria-current",
				"page",
			);
		});
		// @lore AD8a: historical — With the overlay open, there should be no "Active Bets" label (Rail removed).
		expect(screen.queryByText("Active Bets")).toBeNull();
	});

	it("main-content is NOT aria-hidden when Settings is open (it shows settings content)", async () => {
		const user = userEvent.setup();
		renderShell();
		await waitFor(() => {
			expect(screen.getByTestId("main-content")).toBeInTheDocument();
		});
		await user.click(screen.getByRole("button", { name: /settings/i }));
		// P4: settings remains a shell-state content swap (not a dialog).
		await waitFor(() => {
			expect(screen.getByRole("button", { name: /settings/i })).toHaveAttribute(
				"aria-current",
				"page",
			);
		});
		// @lore P4 fix: main-content shows settings section content when settings is open
		// so it must NOT be aria-hidden (screen readers need to access the forms).
		const main = screen.getByTestId("main-content");
		expect(main.getAttribute("aria-hidden")).toBeNull();
	});

	it("Command-K pressed while Settings is open closes Settings and opens search", async () => {
		const user = userEvent.setup();
		renderShell();
		await waitFor(() => {
			expect(screen.getByRole("button", { name: /settings/i })).toBeInTheDocument();
		});
		await user.click(screen.getByRole("button", { name: /settings/i }));
		// P4: settings overlay is now a shell-state content swap (not a dialog).
		await waitFor(() => {
			expect(screen.getByRole("button", { name: /settings/i })).toHaveAttribute(
				"aria-current",
				"page",
			);
		});

		// Fire Command-K. Settings must close; search dialog must open.
		await user.keyboard("{Meta>}k{/Meta}");

		await waitFor(() => {
			expect(screen.getByRole("button", { name: /settings/i })).not.toHaveAttribute("aria-current");
		});
		await waitFor(() => {
			expect(screen.getByRole("dialog", { name: /global search/i })).toBeInTheDocument();
		});
	});
});
