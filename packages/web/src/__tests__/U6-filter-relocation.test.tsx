/**
 * U6 — Filter relocation tests (AC-16, updated for W3).
 *
 * AC-16: Conversations filter controls live in the main pane (Conversations page),
 *        NOT in the Sidebar.
 *
 * @lore W3: The filter pill bar (All/Blocking/Async with role="tab") was replaced
 * by toggle buttons (Blocking/Unread with aria-pressed) in ThreadSections flat mode.
 * These tests verify the W3 toggle pattern and that filters remain in the main pane.
 *
 * Architecture:
 *   - AppShellOutletContext passes conversationsFilter, onFilterChange, onClearFilter
 *   - Conversations.tsx (State A) renders ThreadSections with groupBySection=false
 *   - ThreadSections renders Blocking/Unread toggle buttons
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

describe("Conversations page — AC-16: filter controls in main pane (W3 toggle pattern)", () => {
	it("renders W3 toggle buttons (Blocking, Unread) in the main pane on /conversations", async () => {
		stubFetch(MIXED_THREADS);
		renderShell("/conversations");
		// W3: toggle buttons with aria-pressed (not role="tab")
		const blockingBtn = await screen.findByRole("button", { name: /^blocking$/i });
		expect(blockingBtn).toHaveAttribute("aria-pressed");
		const unreadBtn = screen.getByRole("button", { name: /^unread$/i });
		expect(unreadBtn).toHaveAttribute("aria-pressed");
	});

	it("the Blocking toggle is NOT inside the sidebar element", async () => {
		stubFetch(MIXED_THREADS);
		const { container } = renderShell("/conversations");
		// Wait for the toggle to appear
		await screen.findByRole("button", { name: /^blocking$/i });

		// The sidebar should not contain the Blocking toggle button
		const sidebar = container.querySelector("[data-ds-shell='Sidebar']");
		if (sidebar) {
			const blockingInSidebar = sidebar.querySelector("[aria-pressed]");
			expect(blockingInSidebar).toBeNull();
		}
		// The Blocking toggle should be in the main content area
		const mainContent = container.querySelector("[data-testid='main-content']");
		expect(mainContent).toBeInTheDocument();
		const blockingInMain = mainContent?.querySelector(
			"button[aria-pressed][aria-label*='Blocking'], button[aria-pressed]",
		);
		expect(blockingInMain).not.toBeNull();
	});

	it("clicking 'Blocking' in the main pane filter narrows the thread list", async () => {
		stubFetch(MIXED_THREADS);
		const user = userEvent.setup();
		renderShell("/conversations");
		await waitFor(() => {
			expect(document.querySelectorAll("[data-ds-component='ThreadRow']").length).toBe(5);
		});

		await user.click(await screen.findByRole("button", { name: /^blocking$/i }));
		await waitFor(() => {
			expect(document.querySelectorAll("[data-ds-component='ThreadRow']").length).toBe(2);
		});
	});

	it("clicking 'Blocking' again after narrowing restores the full thread list", async () => {
		stubFetch(MIXED_THREADS);
		const user = userEvent.setup();
		renderShell("/conversations");
		await waitFor(() => {
			expect(document.querySelectorAll("[data-ds-component='ThreadRow']").length).toBe(5);
		});

		const blockingBtn = await screen.findByRole("button", { name: /^blocking$/i });
		await user.click(blockingBtn);
		await waitFor(() => {
			expect(document.querySelectorAll("[data-ds-component='ThreadRow']").length).toBe(2);
		});

		// Toggle off — restores full list (replaces clicking "All" in old UI)
		await user.click(blockingBtn);
		await waitFor(() => {
			expect(document.querySelectorAll("[data-ds-component='ThreadRow']").length).toBe(5);
		});
	});

	it("W3: no 'All' or 'Async' tabs (removed in W3 — only Blocking/Unread toggles)", async () => {
		stubFetch(MIXED_THREADS);
		renderShell("/conversations");
		await screen.findByRole("button", { name: /^blocking$/i });
		// Old tab pattern must not exist
		expect(screen.queryByRole("tab", { name: /^all$/i })).not.toBeInTheDocument();
		expect(screen.queryByRole("tab", { name: /^async$/i })).not.toBeInTheDocument();
	});
});
