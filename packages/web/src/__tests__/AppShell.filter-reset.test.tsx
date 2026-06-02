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
 * J2 review O2 / AC 64: when the active view changes, the filter must
 * reset to inactive state. The filter is local ThreadSections state —
 * switching views remounts the component and resets the toggles.
 *
 * @lore W3: Filter chips moved from FilterPillBar (role="tab", All/Blocking/Async)
 * to ThreadSections toggle buttons (aria-pressed, Blocking/Unread). The reset
 * behavior is tested by verifying the Blocking toggle returns to aria-pressed=false
 * after navigating away and back.
 */
function renderShellAt(initialPath: string): ReturnType<typeof render> {
	const router = createMemoryRouter(
		[
			{
				path: "/",
				element: <AppShell />,
				children: [
					// W3: Use real Conversations component so ThreadSections renders.
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

		// W3: Filter chips are aria-pressed toggle buttons (Blocking, Unread) in ThreadSections.
		// Default state: Blocking is aria-pressed=false (all threads visible).
		const blocking = await screen.findByRole("button", { name: /^blocking$/i });
		expect(blocking).toHaveAttribute("aria-pressed", "false");

		// Switch the filter to "Blocking" (toggle on).
		await user.click(blocking);
		await waitFor(() => {
			expect(screen.getByRole("button", { name: /^blocking$/i })).toHaveAttribute(
				"aria-pressed",
				"true",
			);
		});

		// Navigate to Work via sidebar. Work has no filter row.
		await user.click(screen.getByRole("button", { name: /work/i }));
		await waitFor(() => {
			expect(screen.getByText("Work Page")).toBeInTheDocument();
		});
		// Work page has no blocking toggle.
		expect(screen.queryByRole("button", { name: /^blocking$/i })).not.toBeInTheDocument();

		// Navigate back to Conversations via sidebar. The toggle must be reset to inactive.
		await user.click(screen.getByRole("button", { name: /conversations/i }));
		await waitFor(() => {
			// Blocking toggle should be back to aria-pressed=false (reset by remount)
			expect(screen.getByRole("button", { name: /^blocking$/i })).toHaveAttribute(
				"aria-pressed",
				"false",
			);
		});
	});
});
