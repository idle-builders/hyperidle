import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "../layouts/AppShell";
import { Conversations } from "../pages/Conversations";

beforeEach(() => {
	// L8: AppShell fetches /api/threads on mount — stub it for this suite.
	// Must return a valid user so useCurrentUser resolves participantId.
	global.fetch = vi.fn(async (input: RequestInfo | URL) => {
		const url = typeof input === "string" ? input : input.toString();
		if (url.includes("/api/auth/me")) {
			return {
				ok: true,
				json: async () => ({ id: "u-test", name: "Tester", email: "", avatarUrl: null }),
			} as Response;
		}
		return {
			ok: true,
			json: async () => ({ threads: [], nextCursor: null }),
		} as Response;
	}) as unknown as typeof fetch;
});

/**
 * J2 review O2 / AC 64: when the active view changes, the Submenu filter must
 * reset to "all". The filter is local AppShell state — switching views should
 * not preserve a previous view's filter selection.
 *
 * @lore U6: Filter chips moved from Submenu to the Conversations page (AC-16).
 * Tests now use the real Conversations component so FilterPillBar is rendered.
 */
function renderShellAt(initialPath: string): ReturnType<typeof render> {
	const router = createMemoryRouter(
		[
			{
				path: "/",
				element: <AppShell />,
				children: [
					// @lore U6: Use real Conversations component so FilterPillBar renders.
					{ path: "conversations", element: <Conversations /> },
					{ path: "conversations/:threadId", element: <Conversations /> },
					{ path: "work/portfolio", element: <div>Work Page</div> },
					{ path: "knowledge", element: <div>Knowledge Page</div> },
				],
			},
		],
		{ initialEntries: [initialPath] },
	);
	return render(<RouterProvider router={router} />);
}

describe("AppShell — filter reset on view change (J2 AC 64)", () => {
	it("resets the conversations filter to 'All' when the user navigates to a different view and back", async () => {
		const user = userEvent.setup();
		renderShellAt("/conversations");

		// Wait for Conversations page + FilterPillBar. Filter chips are role="tab" in FilterPillBar.
		const blocking = await screen.findByRole("tab", { name: /^blocking$/i });
		const allTab = screen.getByRole("tab", { name: /^all$/i });
		expect(allTab).toHaveAttribute("aria-selected", "true");

		// Switch the filter to "Blocking".
		await user.click(blocking);
		await waitFor(() => {
			expect(screen.getByRole("tab", { name: /^blocking$/i })).toHaveAttribute(
				"aria-selected",
				"true",
			);
		});

		// Navigate to Work via sidebar. Work has no filter row.
		// @lore U6: sidebar uses getByRole("button", { name: /work/i }) to navigate.
		await user.click(screen.getByRole("button", { name: /work/i }));
		await waitFor(() => {
			expect(screen.getByText("Work Page")).toBeInTheDocument();
		});
		// Work page has no tablist — sanity check.
		expect(screen.queryByRole("tablist")).not.toBeInTheDocument();

		// Navigate back to Conversations via sidebar. The filter must be back at "All".
		await user.click(screen.getByRole("button", { name: /conversations/i }));
		await waitFor(() => {
			expect(screen.getByRole("tab", { name: /^all$/i })).toHaveAttribute("aria-selected", "true");
		});
		expect(screen.getByRole("tab", { name: /^blocking$/i })).toHaveAttribute(
			"aria-selected",
			"false",
		);
	});
});
