/**
 * U6 — AppShell layout tests: Sidebar + main (AC-2).
 *
 * AC-2: AppShell renders `Sidebar | main` layout.
 *   - Sidebar present: data-ds-shell="Sidebar"
 *   - No IconRail present: no data-ds-shell="IconRail"
 *   - No Submenu present: no data-ds-shell="Submenu"
 *   - No Rail present: no data-ds-shell="Rail"
 *   - Main content area present: data-testid="main-content"
 *
 * These tests import AppShell and mount a minimal router. They fail until
 * AppShell is restructured to use Sidebar instead of IconRail/Submenu/Rail.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "../layouts/AppShell";

function stubFetch(): void {
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL) => {
			const url = typeof input === "string" ? input : input.toString();
			if (url.includes("/api/auth/me")) {
				return {
					ok: true,
					json: async () => ({ id: "u-test", name: "Test User", email: "", avatarUrl: null }),
				} as Response;
			}
			if (url.includes("/api/teams")) {
				return {
					ok: true,
					json: async () => ({ teams: [] }),
				} as Response;
			}
			return {
				ok: true,
				json: async () => ({ threads: [], nextCursor: null }),
			} as Response;
		}),
	);
}

function renderShell(initialPath = "/conversations"): ReturnType<typeof render> {
	stubFetch();
	const router = createMemoryRouter(
		[
			{
				path: "/",
				element: <AppShell />,
				children: [
					{ path: "conversations", element: <div>Conversations Page</div> },
					{ path: "work/portfolio", element: <div>Portfolio Page</div> },
					{ path: "knowledge", element: <div>Knowledge Page</div> },
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

describe("AppShell — AC-2: Sidebar + main layout", () => {
	it("renders a Sidebar element (data-ds-shell='Sidebar')", async () => {
		const { container } = renderShell();
		await waitFor(() => {
			expect(container.querySelector("[data-ds-shell='Sidebar']")).toBeInTheDocument();
		});
	});

	it("does NOT render IconRail (data-ds-shell='IconRail')", async () => {
		const { container } = renderShell();
		await waitFor(() => {
			expect(screen.getByTestId("main-content")).toBeInTheDocument();
		});
		expect(container.querySelector("[data-ds-shell='IconRail']")).not.toBeInTheDocument();
	});

	it("does NOT render Submenu (data-ds-shell='Submenu')", async () => {
		const { container } = renderShell();
		await waitFor(() => {
			expect(screen.getByTestId("main-content")).toBeInTheDocument();
		});
		expect(container.querySelector("[data-ds-shell='Submenu']")).not.toBeInTheDocument();
	});

	it("does NOT render Rail (data-ds-shell='Rail')", async () => {
		const { container } = renderShell();
		await waitFor(() => {
			expect(screen.getByTestId("main-content")).toBeInTheDocument();
		});
		expect(container.querySelector("[data-ds-shell='Rail']")).not.toBeInTheDocument();
	});

	it("renders the main content area (data-testid='main-content')", async () => {
		renderShell();
		await waitFor(() => {
			expect(screen.getByTestId("main-content")).toBeInTheDocument();
		});
	});

	it("renders outlet content in main pane", async () => {
		renderShell("/conversations");
		await waitFor(() => {
			expect(screen.getByText("Conversations Page")).toBeInTheDocument();
		});
	});

	it('sidebar renders "HyperIdle" brand wordmark', async () => {
		renderShell();
		await waitFor(() => {
			expect(screen.getByText("HyperIdle")).toBeInTheDocument();
		});
	});
});
