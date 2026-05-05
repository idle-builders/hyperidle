import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "../layouts/AppShell";

beforeEach(() => {
	// L8: AppShell fetches /api/threads on mount — stub it for this suite.
	global.fetch = vi.fn(async () => ({
		ok: true,
		json: async () => ({ threads: [], nextCursor: null }),
	})) as unknown as typeof fetch;
});

/**
 * J2 review O2 / AC 64: when the active view changes, the Submenu filter must
 * reset to "all". The filter is local AppShell state — switching views should
 * not preserve a previous view's filter selection.
 */
function renderShellAt(initialPath: string): ReactElement {
	const router = createMemoryRouter(
		[
			{
				path: "/",
				element: <AppShell />,
				children: [
					// L9: canonical conversation routes replace legacy /review and /chat.
					{ path: "conversations", element: <div>Conversations Page</div> },
					{ path: "conversations/:threadId", element: <div>Conversations Page</div> },
					{ path: "work/portfolio", element: <div>Work Page</div> },
					{ path: "knowledge", element: <div>Knowledge Page</div> },
				],
			},
		],
		{ initialEntries: [initialPath] },
	);
	return <RouterProvider router={router} />;
}

describe("AppShell — filter reset on view change (J2 AC 64)", () => {
	it("resets the Submenu filter to 'All' when the user navigates to a different view and back", async () => {
		const user = userEvent.setup();
		render(renderShellAt("/conversations"));

		// Wait for Conversations submenu + filter row. L10 swapped the
		// chip vocabulary to [All, Blocking, Async]; we now drive the
		// reset assertion through the Blocking chip.
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

		// Navigate to Work via IconRail. Work has no filter row, but the
		// internal filter state should reset to "all" once we leave.
		await user.click(screen.getByRole("button", { name: /work/i }));
		await waitFor(() => {
			expect(screen.getByText("Work Page")).toBeInTheDocument();
		});
		// Work submenu has no tablist — sanity check.
		expect(screen.queryByRole("tablist")).not.toBeInTheDocument();

		// Navigate back to Conversations. The filter must be back at "All".
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
