/**
 * L10 — AppShell ⇄ Submenu ⇄ ThreadSections wiring tests.
 *
 * AC (TRACK-L L10:351–357):
 *   - submenu filter state IS consumed by the thread list (closes the
 *     "set but never read" bug);
 *   - filter narrows correctly; clearing restores;
 *   - empty filtered states show a clear empty state with clear-filter affordance;
 *   - chips inert during error state (approved §5.5).
 *
 * Plan §3 contracts:
 *   - `SUBMENU_FILTERS.conversations` = `[All, Blocking, Async]`;
 *   - `submenuTotalCount` derives from POST-filter length;
 *   - clicking the inline `× Clear` resets to `'all'`;
 *   - clicking the filter-empty `Clear filter` button resets to `'all'`.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "../layouts/AppShell";

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
	/** L10 / T11a: optional. The hook preserves this when present. */
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
					{ path: "conversations", element: <div>Conversations Page</div> },
					{ path: "work/portfolio", element: <div>Work Page</div> },
					{ path: "knowledge", element: <div>Knowledge Page</div> },
				],
			},
		],
		{ initialEntries: [initialPath] },
	);
	render(<RouterProvider router={router} />);
}

function stubFetchOk(rows: MockListRow[]): void {
	global.fetch = vi.fn(async () => ({
		ok: true,
		json: async () => ({ threads: rows, nextCursor: null }),
	})) as unknown as typeof fetch;
}

beforeEach(() => {
	vi.restoreAllMocks();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("AppShell — L10 conversations filter wiring", () => {
	it("renders the L10 chip vocabulary on /conversations: All, Blocking, Async", async () => {
		stubFetchOk(MIXED_THREADS);
		renderShellAt("/conversations");
		expect(await screen.findByRole("tab", { name: /^all$/i })).toBeInTheDocument();
		expect(screen.getByRole("tab", { name: /^blocking$/i })).toBeInTheDocument();
		expect(screen.getByRole("tab", { name: /^async$/i })).toBeInTheDocument();
		// Old chips (`Needs review` / `Chats` / `Resolved`) must NOT be in the
		// Conversations chip row anymore.
		expect(screen.queryByRole("tab", { name: /^needs review$/i })).not.toBeInTheDocument();
		expect(screen.queryByRole("tab", { name: /^chats$/i })).not.toBeInTheDocument();
		expect(screen.queryByRole("tab", { name: /^resolved$/i })).not.toBeInTheDocument();
	});

	it("clicking 'Blocking' narrows the rendered list to blocking threads only", async () => {
		stubFetchOk(MIXED_THREADS);
		const user = userEvent.setup();
		renderShellAt("/conversations");
		// Wait for hook resolution.
		await waitFor(() => {
			expect(document.querySelectorAll("[data-ds-component='ThreadRow']").length).toBe(5);
		});

		await user.click(screen.getByRole("tab", { name: /^blocking$/i }));
		await waitFor(() => {
			expect(document.querySelectorAll("[data-ds-component='ThreadRow']").length).toBe(2);
		});
	});

	it("clicking the inline `× Clear` button restores the full list and resets to 'All'", async () => {
		stubFetchOk(MIXED_THREADS);
		const user = userEvent.setup();
		renderShellAt("/conversations");
		await waitFor(() => {
			expect(document.querySelectorAll("[data-ds-component='ThreadRow']").length).toBe(5);
		});

		await user.click(screen.getByRole("tab", { name: /^blocking$/i }));
		await waitFor(() => {
			expect(document.querySelectorAll("[data-ds-component='ThreadRow']").length).toBe(2);
		});
		// Inline clear is mounted while filter is non-default.
		const clearButton = screen.getByTestId("submenu-filter-clear");
		await user.click(clearButton);
		await waitFor(() => {
			expect(document.querySelectorAll("[data-ds-component='ThreadRow']").length).toBe(5);
		});
		expect(screen.getByRole("tab", { name: /^all$/i })).toHaveAttribute("aria-selected", "true");
		// Clear button should unmount once we're back to 'all'.
		expect(screen.queryByTestId("submenu-filter-clear")).not.toBeInTheDocument();
	});

	it("clicking 'Async' shows only non-blocking threads; clicking 'All' restores", async () => {
		stubFetchOk(MIXED_THREADS);
		const user = userEvent.setup();
		renderShellAt("/conversations");
		await waitFor(() => {
			expect(document.querySelectorAll("[data-ds-component='ThreadRow']").length).toBe(5);
		});

		await user.click(screen.getByRole("tab", { name: /^async$/i }));
		await waitFor(() => {
			expect(document.querySelectorAll("[data-ds-component='ThreadRow']").length).toBe(3);
		});
		await user.click(screen.getByRole("tab", { name: /^all$/i }));
		await waitFor(() => {
			expect(document.querySelectorAll("[data-ds-component='ThreadRow']").length).toBe(5);
		});
	});

	it("Submenu total count badge derives from POST-filter length (plan T8)", async () => {
		stubFetchOk(MIXED_THREADS);
		const user = userEvent.setup();
		renderShellAt("/conversations");

		// Wait for the rows to render so the count badge is post-fetch.
		await waitFor(() => {
			expect(document.querySelectorAll("[data-ds-component='ThreadRow']").length).toBe(5);
		});

		// The Submenu title bar's badge sits next to the "Conversations" title.
		const findCountBadge = (): string => {
			const titleEl = screen.getByText(/^Conversations$/);
			const header = titleEl.parentElement?.parentElement as HTMLElement | null;
			if (!header) throw new Error("Could not locate Submenu header");
			const badge = within(header).getByText(/^\d+$/);
			return badge.textContent ?? "";
		};

		expect(findCountBadge()).toBe("5");
		await user.click(screen.getByRole("tab", { name: /^blocking$/i }));
		await waitFor(() => {
			expect(findCountBadge()).toBe("2");
		});
		await user.click(screen.getByRole("tab", { name: /^async$/i }));
		await waitFor(() => {
			expect(findCountBadge()).toBe("3");
		});
	});

	it("filter-empty: clicking 'Blocking' on an async-only fixture renders the filter-empty EmptyState; Clear filter restores", async () => {
		stubFetchOk(ASYNC_ONLY);
		const user = userEvent.setup();
		renderShellAt("/conversations");

		await waitFor(() => {
			expect(document.querySelectorAll("[data-ds-component='ThreadRow']").length).toBe(2);
		});

		await user.click(screen.getByRole("tab", { name: /^blocking$/i }));

		const filterEmpty = await screen.findByTestId("thread-sections-filter-empty");
		expect(filterEmpty).toBeInTheDocument();

		const clearFilter = within(filterEmpty).getByRole("button", { name: /clear filter/i });
		await user.click(clearFilter);

		await waitFor(() => {
			expect(document.querySelectorAll("[data-ds-component='ThreadRow']").length).toBe(2);
		});
		expect(screen.getByRole("tab", { name: /^all$/i })).toHaveAttribute("aria-selected", "true");
	});

	it("error state: count badge is hidden until status is ready (Adversary H2)", async () => {
		global.fetch = vi.fn(async () => ({
			ok: false,
			status: 500,
			json: async () => ({ error: "boom" }),
		})) as unknown as typeof fetch;
		renderShellAt("/conversations");
		await screen.findByTestId("thread-sections-error");

		const header = screen.getAllByText(/Conversations/i)[0]?.closest("div");
		if (!header) throw new Error("Submenu header not found");
		// No numeric badge should render in the error state — there is no
		// authoritative post-filter count to display.
		expect(within(header).queryByText(/^\d+$/)).toBeNull();
	});

	it("loading state: count badge is hidden until status is ready (Adversary H2)", async () => {
		// Never-resolving fetch keeps the hook in `loading` indefinitely.
		global.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;
		renderShellAt("/conversations");
		await screen.findByTestId("thread-sections-loading");

		const header = screen.getAllByText(/Conversations/i)[0]?.closest("div");
		if (!header) throw new Error("Submenu header not found");
		expect(within(header).queryByText(/^\d+$/)).toBeNull();
	});

	it("error state: chips become inert (aria-disabled) and clicking does not change rendering", async () => {
		// approved §5.5 / plan T10: when the threads fetch fails, the chips
		// render as aria-disabled.
		global.fetch = vi.fn(async () => ({
			ok: false,
			status: 500,
			json: async () => ({ error: "boom" }),
		})) as unknown as typeof fetch;
		const user = userEvent.setup();
		renderShellAt("/conversations");

		// Wait for the error state surface (`thread-sections-error`).
		await screen.findByTestId("thread-sections-error");

		const blocking = screen.getByRole("tab", { name: /^blocking$/i });
		expect(blocking).toHaveAttribute("aria-disabled", "true");

		await user.click(blocking);
		// The thread list area must remain on the error state — no chip
		// activation while errored.
		expect(screen.getByTestId("thread-sections-error")).toBeInTheDocument();
		expect(blocking).toHaveAttribute("aria-disabled", "true");
	});
});
