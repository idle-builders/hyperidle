/**
 * U6 — Filter relocation tests (AC-16, updated for AF14).
 *
 * AC-16: Conversations filter controls live in the main pane (Conversations page),
 *        NOT in the Sidebar.
 *
 * AF14 AC4 update: Blocking/Unread chips have been removed from the flat list.
 * Tests now verify absence of chip elements and that threads render without filtering.
 */

import type { ThreadListRow } from "@hyperidle/domain-model";
import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "../layouts/AppShell";
import { Conversations } from "../pages/Conversations";

// @lore BC3: the thread list now comes from `useThreads({mine:true})` →
// `call("search_threads", ...)`, not `GET /api/threads`.
const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));
vi.mock("../services/call.js", () => ({ call: callMock }));

const STUB_USER = { id: "u-test", name: "Tester", avatarUrl: null };

type MockThread = ThreadListRow;

const NOW_ISO = "2026-05-31T12:00:00.000Z";

function mkThread(id: string, hasUnresolvedReview = false): MockThread {
	return {
		id,
		hostKind: "team",
		hostId: `host-${id}`,
		initiatorId: "u-test",
		members: ["u-test"],
		title: null,
		computedTitle: "Thread",
		pinned: false,
		resolvedAt: null,
		deletedAt: null,
		lastActiveAt: NOW_ISO,
		createdAt: NOW_ISO,
		hasUnresolvedReview,
		lastMessagePreview: null,
	};
}

// Mixed fixture: 2 with unresolved review + 3 without.
const MIXED_THREADS: MockThread[] = [
	mkThread("b1", true),
	mkThread("b2", true),
	mkThread("a1", false),
	mkThread("a2", false),
	mkThread("a3", false),
];

function stubFetch(threads: MockThread[]): void {
	callMock.mockImplementation(async (action: string) => {
		if (action === "search_threads") return { ok: true, data: threads };
		if (action === "open_user") {
			return {
				ok: true,
				data: {
					user: { ...STUB_USER, team: null },
					runsOn: [],
					runConfig: null,
					documentIds: [],
					folders: [],
					subscriptions: [],
					connections: null,
					inbox: null,
				},
			};
		}
		return { ok: true, data: [] };
	});
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL) => {
			const url = typeof input === "string" ? input : input.toString();
			if (url.includes("/api/teams")) {
				return { ok: true, json: async () => ({ teams: [] }) } as Response;
			}
			return { ok: true, json: async () => ({}) } as Response;
		}),
	);
}

function renderShell(initialPath = "/conversations"): ReturnType<typeof render> {
	const router = createMemoryRouter(
		[
			{
				path: "/",
				element: <AppShell />,
				children: [
					{ path: "conversations", element: <Conversations /> },
					{ path: "conversations/:threadId", element: <Conversations /> },
					{ path: "work/portfolio", element: <div>Portfolio</div> },
					{ path: "documents", element: <div>Documents</div> },
				],
			},
		],
		{ initialEntries: [initialPath] },
	);
	return render(<RouterProvider router={router} />);
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("Conversations page — AC-16: filter controls in main pane (W3 toggle pattern)", () => {
	it("Blocking/Unread chips NOT in the main pane (removed by AF14)", async () => {
		stubFetch(MIXED_THREADS);
		renderShell("/conversations");
		// Wait for threads to render
		await waitFor(() => {
			expect(document.querySelectorAll("[data-ds-component='ThreadRow']").length).toBeGreaterThan(
				0,
			);
		});
		// AF14 AC4: chips removed
		expect(screen.queryByRole("button", { name: /^blocking$/i })).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /^unread$/i })).not.toBeInTheDocument();
	});

	it("the sidebar does NOT contain any aria-pressed buttons (no chips anywhere)", async () => {
		stubFetch(MIXED_THREADS);
		const { container } = renderShell("/conversations");
		// Wait for the page to load
		await waitFor(() => {
			expect(container.querySelector("[data-testid='main-content']")).toBeInTheDocument();
		});

		// The sidebar should not contain any aria-pressed buttons
		const sidebar = container.querySelector("[data-ds-shell='Sidebar']");
		if (sidebar) {
			const pressedInSidebar = sidebar.querySelector("[aria-pressed]");
			expect(pressedInSidebar).toBeNull();
		}
		// The main content area has no chip buttons either (AF14 AC4)
		const mainContent = container.querySelector("[data-testid='main-content']");
		expect(mainContent).toBeInTheDocument();
		const chipsInMain = mainContent?.querySelector(
			"button[aria-pressed][aria-label*='Blocking'], button[aria-pressed]",
		);
		expect(chipsInMain).toBeNull();
	});

	it("all threads render unfiltered (no chip to narrow list)", async () => {
		stubFetch(MIXED_THREADS);
		renderShell("/conversations");
		await waitFor(() => {
			expect(document.querySelectorAll("[data-ds-component='ThreadRow']").length).toBe(5);
		});
	});

	it("no All/Async tabs (removed in W3) and no Blocking/Unread chips (removed in AF14)", async () => {
		stubFetch(MIXED_THREADS);
		renderShell("/conversations");
		await waitFor(() => {
			expect(document.querySelectorAll("[data-ds-component='ThreadRow']").length).toBeGreaterThan(
				0,
			);
		});
		// Old tab pattern must not exist
		expect(screen.queryByRole("tab", { name: /^all$/i })).not.toBeInTheDocument();
		expect(screen.queryByRole("tab", { name: /^async$/i })).not.toBeInTheDocument();
		// AF14: chip buttons also removed
		expect(screen.queryByRole("button", { name: /^blocking$/i })).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /^unread$/i })).not.toBeInTheDocument();
	});
});
