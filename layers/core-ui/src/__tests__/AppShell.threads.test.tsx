/**
 * @lore U6: AppShell wires the live thread list into the Sidebar (Conversations section).
 * The Sidebar shows max 5 recent threads as data-thread-id items.
 * The full ThreadSections list moved to the Conversations page.
 *
 * Updated from L8 (Submenu-based) to U6 (Sidebar-based):
 *   §7.2 U6: clicking a sidebar thread item navigates to /conversations/:threadId
 *   §7.3 U6: sidebar thread items are data-thread-id buttons, not ThreadRow components
 *   §7.5 U6: sidebar shows max 5 threads when more are available
 */

import type { ThreadListRow } from "@hyperidle/domain-model";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JSX } from "react";
import { createMemoryRouter, RouterProvider, useOutletContext } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "../layouts/AppShell";

// @lore BC3: the sidebar thread list now comes from `useThreads({mine:true})`
// → `call("search_threads", ...)`, not `GET /api/threads`. `call` is mocked
// (its fallback branch — `{ok:true, data:[]}` — also covers the sidebar's own
// `call("search_documents", ...)`); `fetch` stays mocked for the
// surviving routes (`/api/auth/me`, `/api/teams`) AppShell still hits directly.
const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));
vi.mock("../services/call.js", () => ({ call: callMock }));

const NOW_ISO = "2026-04-30T12:00:00.000Z";
const WITHIN_24H = "2026-04-30T10:00:00.000Z";

function row(overrides: Partial<ThreadListRow>): ThreadListRow {
	return {
		id: overrides.id ?? "t1",
		hostKind: overrides.hostKind ?? "team",
		hostId: overrides.hostId ?? "h-1",
		initiatorId: overrides.initiatorId ?? "u-founder",
		members: overrides.members ?? ["u-founder", "agent-1"],
		title: overrides.title ?? null,
		computedTitle: overrides.computedTitle ?? "Thread",
		pinned: overrides.pinned ?? false,
		resolvedAt: overrides.resolvedAt ?? null,
		deletedAt: overrides.deletedAt ?? null,
		lastActiveAt: overrides.lastActiveAt ?? NOW_ISO,
		createdAt: overrides.createdAt ?? NOW_ISO,
		hasUnresolvedReview: overrides.hasUnresolvedReview ?? false,
		lastMessagePreview: overrides.lastMessagePreview ?? null,
	};
}

const SEVEN_THREADS: ThreadListRow[] = [
	row({ id: "coach", hostKind: "user", pinned: true }),
	row({ id: "a1", hasUnresolvedReview: true }),
	row({ id: "a2", hasUnresolvedReview: true }),
	row({ id: "a3", hasUnresolvedReview: true }),
	row({ id: "a4", hasUnresolvedReview: true }),
	row({ id: "r1", resolvedAt: WITHIN_24H }),
	row({ id: "r2", resolvedAt: WITHIN_24H }),
];

function setFetchMock(threads: ThreadListRow[]): ReturnType<typeof vi.fn> {
	callMock.mockImplementation(async (action: string) => {
		if (action === "search_threads") {
			return { ok: true, data: threads };
		}
		if (action === "open_user") {
			// A valid self row so `useCurrentUser` resolves with a truthy id, which
			// allows `useThreads` to fire its call rather than short-circuiting to
			// the empty ready state (N5 fix).
			return {
				ok: true,
				data: {
					user: { id: "u-founder-test", name: "Founder", avatarUrl: null, team: null },
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
	const fetchMock = vi.fn(async () => {
		// /api/teams and anything else AppShell fetches directly.
		return { ok: true, json: async () => ({}) } as Response;
	});
	global.fetch = fetchMock as unknown as typeof fetch;
	return fetchMock;
}

// Test stub mirrors the production consumer pattern: read the lifted thread
// id from Outlet context and surface it in the DOM so tests can assert the
// main pane updates when a thread item is clicked.
function MainStub(): JSX.Element {
	const ctx = useOutletContext<{ selectedThreadId: string | null } | undefined>();
	return <div data-testid="main-stub">selected:{ctx?.selectedThreadId ?? "none"}</div>;
}

// Stub that exposes threadsStatus from the Outlet context so tests can verify
// AppShell propagates the correct status to child routes (NEW-23).
function ThreadsStatusStub(): JSX.Element {
	const ctx = useOutletContext<{ threadsStatus?: string } | undefined>();
	return <div data-testid="threads-status-stub">{ctx?.threadsStatus ?? "none"}</div>;
}

function renderShell(initialPath = "/conversations"): {
	router: ReturnType<typeof createMemoryRouter>;
} {
	const router = createMemoryRouter(
		[
			{
				path: "/",
				element: <AppShell />,
				children: [
					// L9: canonical routes — the detail route passes :threadId via
					// React Router's param merge so useParams() in AppShell returns it.
					{
						path: "conversations",
						element: <MainStub />,
					},
					{
						path: "conversations/:threadId",
						element: <MainStub />,
					},
				],
			},
		],
		{ initialEntries: [initialPath] },
	);
	render(<RouterProvider router={router} />);
	return { router };
}

describe("U6 — AppShell wires thread list into Sidebar Conversations section", () => {
	beforeEach(() => {
		setFetchMock(SEVEN_THREADS);
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders up to 5 sidebar thread items from /api/threads (U6: max 5 in sidebar)", async () => {
		// @lore U6: Sidebar shows max 5 threads as data-thread-id items.
		// The full list is in the Conversations page (ThreadSections).
		renderShell();
		await waitFor(() => {
			const items = document.querySelectorAll("[data-thread-id]");
			// 7 threads in API but sidebar caps at 5
			expect(items.length).toBe(5);
		});
	});

	it("sidebar thread items have data-thread-id attributes (not ThreadRow components)", async () => {
		// @lore U6: Sidebar uses simple button items with data-thread-id, not ThreadRow.
		renderShell();
		await waitFor(() => {
			const items = document.querySelectorAll("[data-thread-id]");
			expect(items.length).toBeGreaterThan(0);
		});
		// Confirm these are NOT ThreadRow ds-components
		const threadRows = document.querySelectorAll("[data-ds-component='ThreadRow']");
		expect(threadRows.length).toBe(0);
	});

	it("clicking a sidebar thread item navigates to /conversations/:threadId (U6: L9 pattern)", async () => {
		// §7.2 U6: clicking a sidebar thread item navigates to the thread URL.
		const user = userEvent.setup();
		const { router } = renderShell();
		await waitFor(() => {
			const items = document.querySelectorAll("[data-thread-id]");
			expect(items.length).toBe(5);
		});

		// Main pane starts with no thread selected (URL = /conversations, threadId undefined).
		expect(screen.getByTestId("main-stub")).toHaveTextContent("selected:none");

		const items = document.querySelectorAll("[data-thread-id]");
		const firstItem = items[0] as HTMLElement;
		const threadId = firstItem.getAttribute("data-thread-id") ?? "";
		// UI-080: FastNavItem inner element is now <a> (Link), not <button>
		await user.click(firstItem.querySelector("a") ?? firstItem);

		// L9: clicking navigates to /conversations/:threadId.
		await waitFor(() => {
			expect(router.state.location.pathname).toMatch(/^\/conversations\/.+$/);
		});

		// Main pane reflects the selected id via Outlet context (derived from URL).
		await waitFor(() => {
			expect(screen.getByTestId("main-stub").textContent).toMatch(/^selected:.+$/);
			expect(screen.getByTestId("main-stub").textContent).not.toBe("selected:none");
		});

		void threadId; // used above
	});

	it("clicking a sidebar thread item marks it as selected (aria-current=page)", async () => {
		// @lore U6: Sidebar thread items get aria-current="page" on the li when selected.
		const user = userEvent.setup();
		renderShell();
		await waitFor(() => {
			expect(document.querySelectorAll("[data-thread-id]").length).toBe(5);
		});
		const firstItem = document.querySelector("[data-thread-id]") as HTMLElement;
		// UI-080: FastNavItem inner element is now <a> (Link), not <button>
		const btn = firstItem.querySelector("a") ?? firstItem;
		await user.click(btn);
		await waitFor(() => {
			const selected = document.querySelector("[data-thread-id][aria-current='page']");
			expect(selected).not.toBeNull();
		});
	});

	it("sidebar shows 'No threads yet' empty text when threads is empty", async () => {
		setFetchMock([]);
		renderShell();
		await waitFor(() => {
			// Empty state appears in the sidebar Conversations section
			// @lore visual-parity: changed from "No recent conversations" to "No threads yet"
			expect(screen.getByText(/no threads yet/i)).toBeInTheDocument();
		});
	});

	it("sidebar shows 'Couldn't load threads' (not 'No threads yet') when user fetch fails", async () => {
		// @lore UI-011/012/013 + NEW-23: when the API server is unreachable, useCurrentUser
		// fails → user is null → useConversationsThreads short-circuits to status:"ready"
		// (N5 guard). The sidebar must NOT claim "No threads yet" — that is a false empty state.
		// AppShell propagates userStatus==="error" as isThreadsError=true so the sidebar shows
		// "Couldn't load threads" instead.
		callMock.mockImplementation(async (action: string) => {
			if (action === "open_user") {
				return { ok: false, problems: [{ code: "boom", message: "Network error" }] };
			}
			return { ok: true, data: [] };
		});
		renderShell();
		await waitFor(() => {
			expect(screen.queryByText(/no threads yet/i)).not.toBeInTheDocument();
			expect(screen.getByText(/couldn't load threads/i)).toBeInTheDocument();
		});
	});

	it("Outlet context has threadsStatus='error' (not 'ready') when user fetch fails (NEW-23)", async () => {
		// NEW-23: when the API is down, the Conversations page must receive threadsStatus:"error"
		// from AppShell so it shows an error state rather than the false "No conversations yet"
		// empty claim. Verified by reading the Outlet context in a test child route.
		callMock.mockImplementation(async (action: string) => {
			if (action === "open_user") {
				return { ok: false, problems: [{ code: "boom", message: "Network error" }] };
			}
			return { ok: true, data: [] };
		});
		const router = createMemoryRouter(
			[
				{
					path: "/",
					element: <AppShell />,
					children: [{ path: "conversations", element: <ThreadsStatusStub /> }],
				},
			],
			{ initialEntries: ["/conversations"] },
		);
		render(<RouterProvider router={router} />);
		await waitFor(() => {
			const stub = screen.getByTestId("threads-status-stub");
			expect(stub.textContent).toBe("error");
		});
	});
});
