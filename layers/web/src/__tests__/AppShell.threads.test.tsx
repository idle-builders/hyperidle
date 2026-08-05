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

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JSX } from "react";
import { createMemoryRouter, RouterProvider, useOutletContext } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "../layouts/AppShell";

const NOW_ISO = "2026-04-30T12:00:00.000Z";
const WITHIN_24H = "2026-04-30T10:00:00.000Z";

interface MockListRow {
	id: string;
	hostKind: string;
	hostId: string;
	initiatorId: string;
	participants: string[];
	pinned: boolean;
	resolvedAt: string | null;
	lastActiveAt: string;
	createdAt: string;
	hasUnresolvedReview: boolean;
}

function row(overrides: Partial<MockListRow>): MockListRow {
	return {
		id: overrides.id ?? "t1",
		hostKind: overrides.hostKind ?? "task",
		hostId: overrides.hostId ?? "h-1",
		initiatorId: overrides.initiatorId ?? "u-founder",
		participants: overrides.participants ?? ["u-founder", "agent-1"],
		pinned: overrides.pinned ?? false,
		resolvedAt: overrides.resolvedAt ?? null,
		lastActiveAt: overrides.lastActiveAt ?? NOW_ISO,
		createdAt: overrides.createdAt ?? NOW_ISO,
		hasUnresolvedReview: overrides.hasUnresolvedReview ?? false,
	};
}

const SEVEN_THREADS: MockListRow[] = [
	row({ id: "coach", hostKind: "user", pinned: true }),
	row({ id: "a1", hasUnresolvedReview: true }),
	row({ id: "a2", hasUnresolvedReview: true }),
	row({ id: "a3", hasUnresolvedReview: true }),
	row({ id: "a4", hasUnresolvedReview: true }),
	row({ id: "r1", resolvedAt: WITHIN_24H }),
	row({ id: "r2", resolvedAt: WITHIN_24H }),
];

function setFetchMock(threads: MockListRow[]): ReturnType<typeof vi.fn> {
	const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
		const url = typeof input === "string" ? input : input.toString();
		if (url.includes("/api/threads") && !url.match(/\/api\/threads\/[^?]/)) {
			return {
				ok: true,
				json: async () => ({ threads, nextCursor: null }),
			} as Response;
		}
		// /api/auth/me — return a valid user so useCurrentUser resolves with a truthy
		// id, which allows useConversationsThreads to fire its fetch rather than
		// short-circuiting to the empty ready state (N5 fix).
		if (url.includes("/api/auth/me")) {
			return {
				ok: true,
				json: async () => ({ id: "u-founder-test", name: "Founder", email: "", avatarUrl: null }),
			} as Response;
		}
		// Detail endpoint: return minimal valid body.
		return {
			ok: true,
			json: async () => ({
				thread: { id: "stub", participants: [] },
				messages: [],
				headMessageId: null,
				identities: {},
			}),
		} as Response;
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
		await user.click(firstItem.querySelector("button") ?? firstItem);

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
		const btn = firstItem.querySelector("button") ?? firstItem;
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
});
