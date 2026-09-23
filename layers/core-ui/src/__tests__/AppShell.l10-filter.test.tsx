/**
 * L10 — Conversations page filter wiring tests (updated for W3).
 *
 * @lore W3: The filter chips (All/Blocking/Async) with role="tab" were replaced
 * by toggle buttons (Blocking/Unread) with aria-pressed in the ThreadSections
 * flat mode. These tests verify the W3 toggle pattern.
 *
 * AC:
 *   - Blocking and Unread toggle buttons exist (aria-pressed)
 *   - Clicking Blocking narrows list to blocking threads only
 *   - Clicking Blocking again restores all threads
 *   - Empty filtered state shows EmptyState with testid="thread-sections-empty"
 *   - Error state shows error; loading state shows loading skeleton
 *
 * @lore W3: There is no longer an "All" tab, "Async" tab, or "× Clear" button.
 * The W3 flat list uses independent toggles (Blocking, Unread). Toggling off
 * restores the unfiltered list.
 */

import type { ThreadListRow } from "@hyperidle/domain-model";
import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "../layouts/AppShell";
import { Conversations } from "../pages/Conversations";

// @lore BC3: the thread list now comes from `useThreads({mine:true})` →
// `call("search_threads", ...)`, not `GET /api/threads`.
const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));
vi.mock("../services/call.js", () => ({ call: callMock }));

const NOW_ISO = "2026-04-30T12:00:00.000Z";

type MockListRow = ThreadListRow;

function mkRow(overrides: Partial<MockListRow>): MockListRow {
	return {
		id: overrides.id ?? "t1",
		hostKind: overrides.hostKind ?? "team",
		hostId: overrides.hostId ?? "host-1",
		initiatorId: overrides.initiatorId ?? "u-founder",
		members: overrides.members ?? ["u-founder"],
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

// Mixed fixture: 2 unresolved-review + 3 without.
const MIXED_THREADS: MockListRow[] = [
	mkRow({ id: "b1aaaa01", hasUnresolvedReview: true }),
	mkRow({ id: "b2aaaa02", hasUnresolvedReview: true }),
	mkRow({ id: "a1aaaa03" }),
	mkRow({ id: "a2aaaa04" }),
	mkRow({ id: "a3aaaa05" }),
];

// All-async fixture (used to verify filter-empty when picking "Blocking").
const ASYNC_ONLY: MockListRow[] = [mkRow({ id: "a1aaaa01" }), mkRow({ id: "a2aaaa02" })];

function renderShellAt(initialPath: string): void {
	const router = createMemoryRouter(
		[
			{
				path: "/",
				element: <AppShell />,
				children: [
					{ path: "conversations", element: <Conversations /> },
					{ path: "conversations/:threadId", element: <Conversations /> },
					{ path: "work/portfolio", element: <div>Work Page</div> },
					{ path: "documents", element: <div>Document Page</div> },
				],
			},
		],
		{ initialEntries: [initialPath] },
	);
	render(<RouterProvider router={router} />);
}

const STUB_USER = { id: "u-founder-test", name: "Founder", email: "", avatarUrl: null };

/** `open_user({})`'s door result for STUB_USER — `useCurrentUser` reads `data.user`. */
const OPEN_USER_RESULT = {
	ok: true,
	data: {
		user: { ...STUB_USER, team: null },
		runsOn: [],
		runConfig: null,
		documentIds: [],
		folders: [],
		subscriptions: [],
		connections: null,
		behaviour: null,
		inbox: null,
	},
};

function stubFetchOk(rows: MockListRow[]): void {
	callMock.mockImplementation(async (action: string) => {
		if (action === "search_threads") return { ok: true, data: rows };
		if (action === "open_user") return OPEN_USER_RESULT;
		return { ok: true, data: [] };
	});
	global.fetch = vi.fn(async () => {
		return { ok: true, json: async () => ({}) } as Response;
	}) as unknown as typeof fetch;
}

beforeEach(() => {
	vi.restoreAllMocks();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("Conversations page — L10 filter wiring (via AppShell OutletContext)", () => {
	it("AF14 AC4: no Blocking/Unread toggle chips on /conversations (removed by AF14)", async () => {
		stubFetchOk(MIXED_THREADS);
		renderShellAt("/conversations");
		// Wait for threads to render
		await waitFor(() => {
			expect(document.querySelectorAll("[data-ds-component='ThreadRow']").length).toBeGreaterThan(
				0,
			);
		});
		// AF14 AC4: chips removed
		expect(screen.queryByRole("button", { name: /^blocking$/i })).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /^unread$/i })).not.toBeInTheDocument();
		// Old tab chips must NOT be in the document (unchanged)
		expect(screen.queryByRole("tab", { name: /^all$/i })).not.toBeInTheDocument();
		expect(screen.queryByRole("tab", { name: /^async$/i })).not.toBeInTheDocument();
	});

	it("AF14 AC4: all threads render without chip filtering (no chip to narrow list)", async () => {
		stubFetchOk(MIXED_THREADS);
		renderShellAt("/conversations");
		// Wait for threads to render
		await waitFor(() => {
			// All 5 mixed threads should be visible (no active filter)
			expect(document.querySelectorAll("[data-ds-component='ThreadRow']").length).toBe(5);
		});
	});

	it("AF14 AC4: async-only fixture renders all threads (no chip to filter)", async () => {
		stubFetchOk(ASYNC_ONLY);
		renderShellAt("/conversations");
		await waitFor(() => {
			expect(document.querySelectorAll("[data-ds-component='ThreadRow']").length).toBe(2);
		});
		// No chip bar — all 2 threads visible
		expect(screen.queryByRole("button", { name: /^blocking$/i })).not.toBeInTheDocument();
	});

	function stubFetchAuthOnly(): void {
		global.fetch = vi.fn(async () => {
			return { ok: true, json: async () => ({}) } as Response;
		}) as unknown as typeof fetch;
	}

	it("error state: shows error state when fetch fails", async () => {
		stubFetchAuthOnly();
		callMock.mockImplementation(async (action: string) => {
			if (action === "search_threads") {
				return { ok: false, problems: [{ code: "boom", message: "boom", path: "" }] };
			}
			if (action === "open_user") return OPEN_USER_RESULT;
			return { ok: true, data: [] };
		});
		renderShellAt("/conversations");
		await screen.findByTestId("thread-sections-error");
	});

	it("error state: error state persists when fetch fails (chips removed by AF14)", async () => {
		// AF14 AC4: no Blocking chip to click, but error state behavior unchanged.
		stubFetchAuthOnly();
		callMock.mockImplementation(async (action: string) => {
			if (action === "search_threads") {
				return { ok: false, problems: [{ code: "boom", message: "boom", path: "" }] };
			}
			if (action === "open_user") return OPEN_USER_RESULT;
			return { ok: true, data: [] };
		});
		renderShellAt("/conversations");

		// Wait for error state
		await screen.findByTestId("thread-sections-error");
		// No chip buttons present (AF14 AC4 removed them)
		expect(screen.queryByRole("button", { name: /^blocking$/i })).not.toBeInTheDocument();
		// Error state still visible
		expect(screen.getByTestId("thread-sections-error")).toBeInTheDocument();
	});

	it("loading state: shows loading skeleton while fetch is in-flight", async () => {
		// /api/auth/me resolves quickly, then search_threads never resolves → infinite loading.
		stubFetchAuthOnly();
		callMock.mockImplementation(async (action: string) => {
			if (action === "search_threads") return new Promise(() => {});
			if (action === "open_user") return OPEN_USER_RESULT;
			return { ok: true, data: [] };
		});
		renderShellAt("/conversations");
		await screen.findByTestId("thread-sections-loading");

		// Loading state should not show an error.
		expect(screen.queryByTestId("thread-sections-error")).not.toBeInTheDocument();
	});
});
