import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AppShell } from "../layouts/AppShell";

/**
 * J2 review O2 / AC 64: When AppShell navigates between views, the
 * conversations submenu unmounts and remounts. The L3 routing chip filter
 * is now URL-persisted (search param), so this no longer exercises the
 * J2 in-memory chip reset — it asserts the navigation round trip keeps
 * the submenu mountable.
 *
 * The dedicated chip-reset assertion lives at
 * `ConversationsSubmenu.filters.test.tsx` ("selecting 'All' clears the
 * ?routedTo= param"); covering chip persistence with a real /api/me
 * actor here would require mocking `fetch` and is deferred to an L3 e2e.
 */
function renderShellAt(initialPath: string): ReactElement {
	const router = createMemoryRouter(
		[
			{
				path: "/",
				element: <AppShell />,
				children: [
					{ path: "conversations/review", element: <div>Conversations Page</div> },
					{ path: "work/portfolio", element: <div>Work Page</div> },
					{ path: "knowledge", element: <div>Knowledge Page</div> },
				],
			},
		],
		{ initialEntries: [initialPath] },
	);
	return <RouterProvider router={router} />;
}

describe("AppShell — Conversations submenu navigation round trip (L3)", () => {
	it("renders the conversations submenu, navigates away and back, and remounts cleanly", async () => {
		const user = userEvent.setup();
		render(renderShellAt("/conversations/review"));

		// L3 chips render once me identity loads. With useMe falling back to
		// null on a failed/in-flight fetch, the chip bar is hidden — so we
		// gate this test on the core "submenu renders" signal first.
		await screen.findByTestId("conversations-submenu");

		// Navigate to Work; conversations submenu unmounts.
		await user.click(screen.getByRole("button", { name: /work/i }));
		await waitFor(() => {
			expect(screen.getByText("Work Page")).toBeInTheDocument();
		});

		// Navigate back to Conversations.
		await user.click(screen.getByRole("button", { name: /conversations/i }));
		await waitFor(() => {
			expect(screen.getByTestId("conversations-submenu")).toBeInTheDocument();
		});
	});
});
