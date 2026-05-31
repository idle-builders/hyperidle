/**
 * U6 — Filter relocation tests (AC-16).
 *
 * AC-16: Conversations filter pill bar (All/Blocking/Async) lives in the main
 *        pane (Conversations page), NOT in the Sidebar.
 *
 * The Conversations page reads filter state from OutletContext and renders the
 * pill bar inline. The Sidebar must NOT contain filter chips.
 *
 * Architecture:
 *   - AppShellOutletContext extended with { conversationsFilter, onFilterChange, onClearFilter }
 *   - Conversations.tsx reads from OutletContext, renders the pill bar at the top
 *   - Sidebar has no filter chip elements
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "../layouts/AppShell";
import { Conversations } from "../pages/Conversations";

const STUB_USER = { id: "u-test", name: "Tester", email: "", avatarUrl: null };

interface MockThread {
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

const NOW_ISO = "2026-05-31T12:00:00.000Z";

function mkThread(id: string, blocking = false): MockThread {
	return {
		id,
		hostKind: "task",
		hostId: `host-${id}`,
		initiatorId: "u-test",
		participants: ["u-test"],
		pinned: false,
		resolvedAt: null,
		lastActiveAt: NOW_ISO,
		createdAt: NOW_ISO,
		hasUnresolvedReview: false,
		blocking,
	};
}

// Mixed fixture: 2 blocking + 3 async
const MIXED_THREADS: MockThread[] = [
	mkThread("b1", true),
	mkThread("b2", true),
	mkThread("a1", false),
	mkThread("a2", false),
	mkThread("a3", false),
];

function stubFetch(threads: MockThread[]): void {
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL) => {
			const url = typeof input === "string" ? input : input.toString();
			if (url.includes("/api/auth/me")) {
				return { ok: true, json: async () => STUB_USER } as Response;
			}
			if (url.includes("/api/threads") && !url.match(/\/api\/threads\/[^?]/)) {
				return {
					ok: true,
					json: async () => ({ threads, nextCursor: null }),
				} as Response;
			}
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
					{ path: "knowledge", element: <div>Knowledge</div> },
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

describe("Conversations page — AC-16: filter pill bar in main pane", () => {
	it("renders the filter pill bar (All/Blocking/Async tabs) in the main pane on /conversations", async () => {
		stubFetch(MIXED_THREADS);
		renderShell("/conversations");
		expect(await screen.findByRole("tab", { name: /^all$/i })).toBeInTheDocument();
		expect(screen.getByRole("tab", { name: /^blocking$/i })).toBeInTheDocument();
		expect(screen.getByRole("tab", { name: /^async$/i })).toBeInTheDocument();
	});

	it("the filter pill bar is NOT inside the sidebar element", async () => {
		stubFetch(MIXED_THREADS);
		const { container } = renderShell("/conversations");
		// Wait for the pill bar to appear
		await screen.findByRole("tab", { name: /^all$/i });

		// The sidebar should not contain filter tabs
		const sidebar = container.querySelector("[data-ds-shell='Sidebar']");
		if (sidebar) {
			const filterTabsInSidebar = sidebar.querySelectorAll("[role='tab']");
			// Filter tabs should not be inside the sidebar
			expect(filterTabsInSidebar.length).toBe(0);
		}
		// The filter should be in the main content area
		const mainContent = container.querySelector("[data-testid='main-content']");
		expect(mainContent).toBeInTheDocument();
		const filterTabsInMain = mainContent?.querySelectorAll("[role='tab']");
		expect(filterTabsInMain?.length ?? 0).toBeGreaterThan(0);
	});

	it("clicking 'Blocking' in the main pane filter narrows the thread list", async () => {
		stubFetch(MIXED_THREADS);
		const user = userEvent.setup();
		renderShell("/conversations");
		await waitFor(() => {
			expect(document.querySelectorAll("[data-ds-component='ThreadRow']").length).toBe(5);
		});

		await user.click(screen.getByRole("tab", { name: /^blocking$/i }));
		await waitFor(() => {
			expect(document.querySelectorAll("[data-ds-component='ThreadRow']").length).toBe(2);
		});
	});

	it("clicking 'All' after 'Blocking' restores the full thread list", async () => {
		stubFetch(MIXED_THREADS);
		const user = userEvent.setup();
		renderShell("/conversations");
		await waitFor(() => {
			expect(document.querySelectorAll("[data-ds-component='ThreadRow']").length).toBe(5);
		});

		await user.click(screen.getByRole("tab", { name: /^blocking$/i }));
		await waitFor(() => {
			expect(document.querySelectorAll("[data-ds-component='ThreadRow']").length).toBe(2);
		});

		await user.click(screen.getByRole("tab", { name: /^all$/i }));
		await waitFor(() => {
			expect(document.querySelectorAll("[data-ds-component='ThreadRow']").length).toBe(5);
		});
	});

	it("clicking 'Async' narrows to non-blocking threads", async () => {
		stubFetch(MIXED_THREADS);
		const user = userEvent.setup();
		renderShell("/conversations");
		await waitFor(() => {
			expect(document.querySelectorAll("[data-ds-component='ThreadRow']").length).toBe(5);
		});

		await user.click(screen.getByRole("tab", { name: /^async$/i }));
		await waitFor(() => {
			expect(document.querySelectorAll("[data-ds-component='ThreadRow']").length).toBe(3);
		});
	});
});
