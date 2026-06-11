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

import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "../layouts/AppShell";
import { Conversations } from "../pages/Conversations";

const NOW_ISO = "2026-04-30T12:00:00.000Z";

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
	blocking?: boolean;
}

function mkRow(overrides: Partial<MockListRow>): MockListRow {
	return {
		id: overrides.id ?? "t1",
		hostKind: overrides.hostKind ?? "task",
		hostId: overrides.hostId ?? "host-1",
		initiatorId: overrides.initiatorId ?? "u-founder",
		participants: overrides.participants ?? ["u-founder"],
		pinned: overrides.pinned ?? false,
		resolvedAt: overrides.resolvedAt ?? null,
		lastActiveAt: overrides.lastActiveAt ?? NOW_ISO,
		createdAt: overrides.createdAt ?? NOW_ISO,
		hasUnresolvedReview: overrides.hasUnresolvedReview ?? false,
		blocking: overrides.blocking,
	};
}

// Mixed fixture: 2 blocking + 3 async.
const MIXED_THREADS: MockListRow[] = [
	mkRow({ id: "b1aaaa01", blocking: true }),
	mkRow({ id: "b2aaaa02", blocking: true }),
	mkRow({ id: "a1aaaa03", blocking: false }),
	mkRow({ id: "a2aaaa04", blocking: false }),
	mkRow({ id: "a3aaaa05", blocking: false }),
];

// All-async fixture (used to verify filter-empty when picking "Blocking").
const ASYNC_ONLY: MockListRow[] = [
	mkRow({ id: "a1aaaa01", blocking: false }),
	mkRow({ id: "a2aaaa02", blocking: false }),
];

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
					{ path: "knowledge", element: <div>Knowledge Page</div> },
				],
			},
		],
		{ initialEntries: [initialPath] },
	);
	render(<RouterProvider router={router} />);
}

const STUB_USER = { id: "u-founder-test", name: "Founder", email: "", avatarUrl: null };

function stubFetchOk(rows: MockListRow[]): void {
	global.fetch = vi.fn(async (input: RequestInfo | URL) => {
		const url = typeof input === "string" ? input : input.toString();
		if (url.includes("/api/auth/me")) {
			return { ok: true, json: async () => STUB_USER } as Response;
		}
		if (url.includes("/api/threads") && !url.match(/\/api\/threads\/[^?]/)) {
			return {
				ok: true,
				json: async () => ({ threads: rows, nextCursor: null }),
			} as Response;
		}
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

	it("error state: shows error state when fetch fails", async () => {
		global.fetch = vi.fn(async (input: RequestInfo | URL) => {
			const url = typeof input === "string" ? input : input.toString();
			if (url.includes("/api/auth/me")) {
				return { ok: true, json: async () => STUB_USER } as Response;
			}
			return { ok: false, status: 500, json: async () => ({ error: "boom" }) } as Response;
		}) as unknown as typeof fetch;
		renderShellAt("/conversations");
		await screen.findByTestId("thread-sections-error");
	});

	it("error state: error state persists when fetch fails (chips removed by AF14)", async () => {
		// AF14 AC4: no Blocking chip to click, but error state behavior unchanged.
		global.fetch = vi.fn(async (input: RequestInfo | URL) => {
			const url = typeof input === "string" ? input : input.toString();
			if (url.includes("/api/auth/me")) {
				return { ok: true, json: async () => STUB_USER } as Response;
			}
			return { ok: false, status: 500, json: async () => ({ error: "boom" }) } as Response;
		}) as unknown as typeof fetch;
		renderShellAt("/conversations");

		// Wait for error state
		await screen.findByTestId("thread-sections-error");
		// No chip buttons present (AF14 AC4 removed them)
		expect(screen.queryByRole("button", { name: /^blocking$/i })).not.toBeInTheDocument();
		// Error state still visible
		expect(screen.getByTestId("thread-sections-error")).toBeInTheDocument();
	});

	it("loading state: shows loading skeleton while fetch is in-flight", async () => {
		// /api/auth/me resolves quickly, then threads never resolve → infinite loading.
		global.fetch = vi.fn(async (input: RequestInfo | URL) => {
			const url = typeof input === "string" ? input : input.toString();
			if (url.includes("/api/auth/me")) {
				return { ok: true, json: async () => STUB_USER } as Response;
			}
			return new Promise<Response>(() => {});
		}) as unknown as typeof fetch;
		renderShellAt("/conversations");
		await screen.findByTestId("thread-sections-loading");

		// Loading state should not show an error.
		expect(screen.queryByTestId("thread-sections-error")).not.toBeInTheDocument();
	});
});
