import type { ThreadListRow } from "@hyperidle/domain-model";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "../layouts/AppShell";
import { Conversations } from "../pages/Conversations";

// @lore BC3: the thread list now comes from `useThreads({mine:true})` →
// `call("search_threads", ...)`, not `GET /api/threads`.
const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));
vi.mock("../services/call.js", () => ({ call: callMock }));

// AF14 AC4: filter chips (Blocking, Unread) removed from Conversations.
// One thread is still needed so the list renders.
const ONE_THREAD: ThreadListRow = {
	id: "t-filter-test",
	hostKind: "team",
	hostId: "h-1",
	initiatorId: "u-test",
	members: ["u-test", "agent-1"],
	title: null,
	computedTitle: "Thread",
	pinned: false,
	resolvedAt: null,
	deletedAt: null,
	lastActiveAt: "2026-04-30T12:00:00.000Z",
	createdAt: "2026-04-30T12:00:00.000Z",
	hasUnresolvedReview: false,
	lastMessagePreview: null,
};

beforeEach(() => {
	callMock.mockImplementation(async (action: string) => {
		if (action === "search_threads") return { ok: true, data: [ONE_THREAD] };
		return { ok: true, data: [] };
	});
	global.fetch = vi.fn(async (input: RequestInfo | URL) => {
		const url = typeof input === "string" ? input : input.toString();
		if (url.includes("/api/auth/me")) {
			return {
				ok: true,
				json: async () => ({ id: "u-test", name: "Tester", email: "", avatarUrl: null }),
			} as Response;
		}
		return { ok: true, json: async () => ({}) } as Response;
	}) as unknown as typeof fetch;
});

/**
 * J2 review O2 / AC 64: filter reset on view change.
 *
 * AF14 AC4: Blocking/Unread chips removed from flat list. The filter-reset
 * behavior is now verified by: (1) no chips present on /conversations,
 * (2) navigation away and back still renders the list without chips.
 */
function renderShellAt(initialPath: string): ReturnType<typeof render> {
	const router = createMemoryRouter(
		[
			{
				path: "/",
				element: <AppShell />,
				children: [
					{ path: "conversations", element: <Conversations /> },
					{ path: "conversations/:threadId", element: <Conversations /> },
					{ path: "work", element: <div>Work Page</div> },
					{ path: "work/portfolio", element: <div>Work Page</div> },
					{ path: "documents", element: <div>Document Page</div> },
				],
			},
		],
		{ initialEntries: [initialPath] },
	);
	return render(<RouterProvider router={router} />);
}

describe("AppShell — filter reset on view change (J2 AC 64)", () => {
	it("AF14 AC4: no filter chips on /conversations — list renders all threads without chips", async () => {
		// AF14 supersedes the old chip-toggle-reset flow.
		// No chips = no filter state to reset. Threads just render.
		renderShellAt("/conversations");
		// Threads section renders
		await waitFor(() => {
			expect(screen.getByTestId("flat-thread-list")).toBeInTheDocument();
		});
		// No chip buttons (AF14 AC4)
		expect(screen.queryByRole("button", { name: /^blocking$/i })).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /^unread$/i })).not.toBeInTheDocument();
	});

	it("navigating away and back to /conversations keeps no chip buttons (reset is a no-op)", async () => {
		const user = userEvent.setup();
		renderShellAt("/conversations");

		// Wait for threads to render
		await waitFor(() => {
			expect(screen.getByTestId("flat-thread-list")).toBeInTheDocument();
		});

		// Navigate to Work via sidebar (UI-080: section headers are links now)
		await user.click(screen.getByRole("link", { name: /work/i }));
		await waitFor(() => {
			expect(screen.getByText("Work Page")).toBeInTheDocument();
		});

		// Navigate back to Conversations (UI-080: section headers are links now)
		await user.click(screen.getByRole("link", { name: /conversations/i }));
		await waitFor(() => {
			expect(screen.getByTestId("flat-thread-list")).toBeInTheDocument();
		});

		// Still no chip buttons after remount
		expect(screen.queryByRole("button", { name: /^blocking$/i })).not.toBeInTheDocument();
	});
});
