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
import userEvent from "@testing-library/user-event";
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
	it("renders the W3 toggle vocabulary on /conversations: Blocking, Unread (aria-pressed)", async () => {
		stubFetchOk(MIXED_THREADS);
		renderShellAt("/conversations");
		// W3: Blocking and Unread are aria-pressed toggle buttons, not role="tab"
		const blocking = await screen.findByRole("button", { name: /^blocking$/i });
		expect(blocking).toHaveAttribute("aria-pressed");
		const unread = screen.getByRole("button", { name: /^unread$/i });
		expect(unread).toHaveAttribute("aria-pressed");
		// Old tab chips must NOT be in the document
		expect(screen.queryByRole("tab", { name: /^all$/i })).not.toBeInTheDocument();
		expect(screen.queryByRole("tab", { name: /^async$/i })).not.toBeInTheDocument();
	});

	it("clicking 'Blocking' narrows the rendered list to blocking threads only", async () => {
		stubFetchOk(MIXED_THREADS);
		const user = userEvent.setup();
		renderShellAt("/conversations");
		// Wait for hook resolution.
		await waitFor(() => {
			expect(document.querySelectorAll("[data-ds-component='ThreadRow']").length).toBe(5);
		});

		await user.click(await screen.findByRole("button", { name: /^blocking$/i }));
		await waitFor(() => {
			expect(document.querySelectorAll("[data-ds-component='ThreadRow']").length).toBe(2);
		});
	});

	it("clicking 'Blocking' again restores the full list (toggle off = show all)", async () => {
		stubFetchOk(MIXED_THREADS);
		const user = userEvent.setup();
		renderShellAt("/conversations");
		await waitFor(() => {
			expect(document.querySelectorAll("[data-ds-component='ThreadRow']").length).toBe(5);
		});

		const blockingBtn = await screen.findByRole("button", { name: /^blocking$/i });
		await user.click(blockingBtn);
		await waitFor(() => {
			expect(document.querySelectorAll("[data-ds-component='ThreadRow']").length).toBe(2);
		});
		// Toggle off — restores full list
		await user.click(blockingBtn);
		await waitFor(() => {
			expect(document.querySelectorAll("[data-ds-component='ThreadRow']").length).toBe(5);
		});
	});

	it("filter-empty: clicking 'Blocking' on an async-only fixture shows EmptyState", async () => {
		stubFetchOk(ASYNC_ONLY);
		const user = userEvent.setup();
		renderShellAt("/conversations");

		await waitFor(() => {
			expect(document.querySelectorAll("[data-ds-component='ThreadRow']").length).toBe(2);
		});

		await user.click(await screen.findByRole("button", { name: /^blocking$/i }));

		// W3: flat mode shows thread-sections-empty (not thread-sections-filter-empty)
		const emptyState = await screen.findByTestId("thread-sections-empty");
		expect(emptyState).toBeInTheDocument();
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

	it("error state: clicking Blocking while errored does not change rendering", async () => {
		// When the threads fetch fails, the error state should persist even if toggles are clicked.
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
		// Error state renders before toggles (flat mode returns early on error)
		expect(screen.queryByRole("button", { name: /^blocking$/i })).not.toBeInTheDocument();
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
