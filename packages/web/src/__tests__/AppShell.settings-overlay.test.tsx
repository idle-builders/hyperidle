/**
 * J3 — AppShell integration: Settings overlay dims the main content, hides
 * the Rail, and Command-K pressed while Settings is open closes Settings
 * (then opens search on the second render tick).
 *
 * These assertions extend AppShell.test.tsx without editing the protected
 * baseline.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "../layouts/AppShell";

function renderShell(initialPath = "/conversations/review"): ReturnType<typeof render> {
	const router = createMemoryRouter(
		[
			{
				path: "/",
				element: <AppShell />,
				children: [
					{ path: "conversations/review", element: <div>Review Page</div> },
					{ path: "conversations/chat", element: <div>Chat Page</div> },
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
				// L8: include `threads` for the Conversations Submenu hook.
				Promise.resolve({
					conversations: [],
					work: [],
					knowledge: [],
					threads: [],
					nextCursor: null,
				}),
		}) as typeof fetch;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("hides the Rail from the accessibility tree when Settings is open", async () => {
		const user = userEvent.setup();
		renderShell();
		await waitFor(() => {
			expect(screen.getByText("Active Bets")).toBeInTheDocument();
		});
		await user.click(screen.getByRole("button", { name: /user profile/i }));
		await waitFor(() => {
			expect(screen.getByRole("dialog", { name: /settings/i })).toBeInTheDocument();
		});
		// With the overlay present, Rail landmarks must not be reachable.
		// Accepting either unmount (query returns null) or aria-hidden (query
		// still finds the node but aria-hidden="true").
		const bets = screen.queryByText("Active Bets");
		if (bets) {
			const railRoot = bets.closest("[aria-hidden]");
			expect(railRoot?.getAttribute("aria-hidden")).toBe("true");
		} else {
			expect(bets).toBeNull();
		}
	});

	it("marks main content as inert / aria-hidden while Settings is open", async () => {
		const user = userEvent.setup();
		renderShell();
		await waitFor(() => {
			expect(screen.getByTestId("main-content")).toBeInTheDocument();
		});
		await user.click(screen.getByRole("button", { name: /user profile/i }));
		await waitFor(() => {
			expect(screen.getByRole("dialog", { name: /settings/i })).toBeInTheDocument();
		});
		const main = screen.getByTestId("main-content");
		expect(main.getAttribute("aria-hidden")).toBe("true");
	});

	it("Command-K pressed while Settings is open closes Settings and opens search", async () => {
		const user = userEvent.setup();
		renderShell();
		await waitFor(() => {
			expect(screen.getByRole("button", { name: /user profile/i })).toBeInTheDocument();
		});
		await user.click(screen.getByRole("button", { name: /user profile/i }));
		await waitFor(() => {
			expect(screen.getByRole("dialog", { name: /settings/i })).toBeInTheDocument();
		});

		// Fire Command-K. Settings must close; search dialog must open.
		await user.keyboard("{Meta>}k{/Meta}");

		await waitFor(() => {
			expect(screen.queryByRole("dialog", { name: /settings/i })).not.toBeInTheDocument();
		});
		await waitFor(() => {
			expect(screen.getByRole("dialog", { name: /global search/i })).toBeInTheDocument();
		});
	});
});
