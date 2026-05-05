/**
 * L8 — AppShell wires the live thread list into the Conversations Submenu.
 *
 * Protected tests (plan §7):
 *   §7.1 counts derived from list (not literals)
 *   §7.2 L9: selection NAVIGATES to /conversations/:threadId (URL is
 *        authoritative); selectedThreadId in Outlet context is derived from
 *        the URL param and still surfaces via useOutletContext (backwards-compat).
 *   §7.3 SUBMENU_CONFIG has no static conversations items
 *
 * L9 update to §7.2: clicking a thread row now calls navigate() to
 * /conversations/:threadId. The legacy "selection must not navigate" assertion
 * (L8) is updated because the behavior intentionally changed in L9 — the URL
 * becomes the source of truth for the selected thread.
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
		// Detail endpoint: return minimal valid body so ConversationsReview can mount.
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
// main pane updates when a thread row is clicked.
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

describe("L8 — AppShell renders Conversations Submenu thread list", () => {
	beforeEach(() => {
		setFetchMock(SEVEN_THREADS);
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders threads from /api/threads as the submenu list", async () => {
		renderShell();
		await waitFor(() => {
			const rows = document.querySelectorAll("[data-ds-component='ThreadRow']");
			expect(rows.length).toBe(SEVEN_THREADS.length);
		});
	});

	it("SUBMENU_CONFIG has no static conversations items (no Review Queue / Chat NavItems)", async () => {
		// PROTECTED §7.3 — recurrence guard.
		renderShell();
		await waitFor(() => {
			const rows = document.querySelectorAll("[data-ds-component='ThreadRow']");
			expect(rows.length).toBeGreaterThan(0);
		});
		// The legacy static labels must never render in conversations submenu.
		expect(screen.queryByText("Review Queue")).toBeNull();
		// "Chat" specifically as the static NavItem label is forbidden.
		// Note: a thread row title may still contain the word "Chat" — but
		// the static NavItem label was the bare token "Chat".
		const chatNavItems = screen
			.queryAllByText("Chat")
			.filter((el) => el.closest("[data-ds-component='NavItem']") !== null);
		expect(chatNavItems.length).toBe(0);
	});

	it("submenu title-bar count equals total rendered rows (not a literal)", async () => {
		// PROTECTED §7.1 — counts-derived-from-list at the chrome level.
		renderShell();
		await waitFor(() => {
			const rows = document.querySelectorAll("[data-ds-component='ThreadRow']");
			expect(rows.length).toBe(7);
		});
		// The legacy hardcoded counts at AppShell.tsx:40-41 were 3 and 1
		// (sum=4). With 7 rows, the total badge must be 7 — NOT 4.
		// Locate the badge inside the Submenu (the count appears next to "Conversations").
		const titleEl = await screen.findByText("Conversations");
		const titleParent = titleEl.parentElement as HTMLElement;
		const badge = titleParent.querySelector("span.badge");
		expect(badge?.textContent).toBe("7");
	});

	it("clicking a thread row navigates to /conversations/:threadId (L9) and surfaces selectedThreadId via outlet context", async () => {
		// PROTECTED §7.2 — L9 update: selection NOW navigates to the canonical
		// /conversations/:threadId URL (the URL is the source of truth). The
		// selectedThreadId Outlet context field is derived from useParams() so
		// the Main pane still receives the id through useOutletContext —
		// backwards-compat contract preserved (arch-critique WARNING §1).
		// Architecture C2 / Adversary B1: the lifted id reaches the Main pane
		// through Outlet context regardless of whether it comes from useState or URL.
		const user = userEvent.setup();
		const { router } = renderShell();
		await waitFor(() => {
			const rows = document.querySelectorAll("[data-ds-component='ThreadRow']");
			expect(rows.length).toBe(7);
		});

		// Main pane starts with no thread selected (URL = /conversations, threadId undefined).
		expect(screen.getByTestId("main-stub")).toHaveTextContent("selected:none");

		const rows = document.querySelectorAll("[data-ds-component='ThreadRow']");
		await user.click(rows[2] as HTMLElement);

		// L9: clicking DOES navigate — URL path changes to /conversations/:threadId.
		await waitFor(() => {
			expect(router.state.location.pathname).toMatch(/^\/conversations\/.+$/);
		});

		// Main pane reflects the selected id via Outlet context (derived from URL).
		await waitFor(() => {
			expect(screen.getByTestId("main-stub").textContent).toMatch(/^selected:.+$/);
			expect(screen.getByTestId("main-stub").textContent).not.toBe("selected:none");
		});
	});

	it("clicking a row marks it as selected (aria-current=true)", async () => {
		const user = userEvent.setup();
		renderShell();
		await waitFor(() => {
			expect(document.querySelectorAll("[data-ds-component='ThreadRow']").length).toBe(7);
		});
		const rows = document.querySelectorAll("[data-ds-component='ThreadRow']");
		await user.click(rows[1] as HTMLElement);
		await waitFor(() => {
			const selected = document.querySelector(
				"[data-ds-component='ThreadRow'][aria-current='true']",
			);
			expect(selected).not.toBeNull();
		});
	});

	it("renders ErrorState when /api/threads request fails", async () => {
		global.fetch = vi.fn(async () => ({
			ok: false,
			status: 500,
			json: async () => ({ error: "boom" }),
		})) as unknown as typeof fetch;
		renderShell();
		await waitFor(() => {
			expect(screen.getByTestId("thread-sections-error")).toBeInTheDocument();
		});
	});

	it("title-bar count is hidden when there are zero threads", async () => {
		setFetchMock([]);
		renderShell();
		await waitFor(() => {
			expect(screen.getByTestId("thread-sections-empty")).toBeInTheDocument();
		});
		const titleEl = await screen.findByText("Conversations");
		const titleParent = titleEl.parentElement as HTMLElement;
		expect(titleParent.querySelector("span.badge")).toBeNull();
	});
});
