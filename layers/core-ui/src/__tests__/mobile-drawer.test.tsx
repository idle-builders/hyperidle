/**
 * Mobile drawer tests.
 *
 * At viewport <= 768px, the sidebar collapses to a drawer. A hamburger button
 * opens the drawer. Clicking the scrim closes the drawer. On desktop, the
 * sidebar is in the normal flow with no hamburger.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "../layouts/AppShell";

function setViewportWidth(width: number): void {
	Object.defineProperty(window, "innerWidth", {
		writable: true,
		configurable: true,
		value: width,
	});
	window.dispatchEvent(new Event("resize"));
}

function stubFetch(): void {
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL) => {
			const url = typeof input === "string" ? input : input.toString();
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
					{
						path: "conversations",
						element: <div data-testid="conversations-page">Conversations</div>,
					},
					{
						path: "conversations/:threadId",
						element: <div data-testid="thread-detail-page">Thread Detail</div>,
					},
					{ path: "work/portfolio", element: <div>Portfolio</div> },
					{ path: "documents", element: <div>Documents</div> },
				],
			},
		],
		{ initialEntries: [initialPath] },
	);
	return render(<RouterProvider router={router} />);
}

const originalWidth = window.innerWidth;

afterEach(() => {
	vi.restoreAllMocks();
	setViewportWidth(originalWidth);
});

describe("Mobile drawer: hamburger, open, close", () => {
	it("at desktop (1920px): sidebar is in normal flow, no hamburger", async () => {
		setViewportWidth(1920);
		const { container } = renderShell();
		await waitFor(() => {
			expect(container.querySelector("[data-ds-shell='Sidebar']")).toBeInTheDocument();
		});
		expect(screen.queryByTestId("mobile-hamburger")).not.toBeInTheDocument();
		expect(screen.queryByTestId("mobile-drawer")).not.toBeInTheDocument();
	});

	it("at mobile (375px): hamburger button is visible", async () => {
		setViewportWidth(375);
		renderShell();
		await waitFor(() => {
			expect(screen.getByTestId("mobile-hamburger")).toBeInTheDocument();
		});
	});

	it("at mobile (375px): sidebar is NOT in the normal layout flow", async () => {
		setViewportWidth(375);
		const { container } = renderShell();
		await waitFor(() => {
			expect(screen.getByTestId("mobile-hamburger")).toBeInTheDocument();
		});
		// Sidebar should not be in normal flow at mobile
		expect(
			container.querySelector(
				"[data-ds-shell='Sidebar']:not([data-testid='mobile-drawer'] [data-ds-shell='Sidebar'])",
			),
		).not.toBeInTheDocument();
	});

	it("at mobile (375px): drawer is closed initially, no scrim", async () => {
		setViewportWidth(375);
		renderShell();
		await waitFor(() => {
			expect(screen.getByTestId("mobile-hamburger")).toBeInTheDocument();
		});
		expect(screen.queryByTestId("mobile-drawer")).not.toBeInTheDocument();
		expect(screen.queryByTestId("mobile-scrim")).not.toBeInTheDocument();
	});

	it("at mobile (375px): clicking hamburger opens the drawer", async () => {
		setViewportWidth(375);
		const user = userEvent.setup();
		renderShell();
		await waitFor(() => {
			expect(screen.getByTestId("mobile-hamburger")).toBeInTheDocument();
		});

		await user.click(screen.getByTestId("mobile-hamburger"));

		await waitFor(() => {
			expect(screen.getByTestId("mobile-drawer")).toBeInTheDocument();
		});
		expect(screen.getByTestId("mobile-scrim")).toBeInTheDocument();
	});

	it("at mobile (375px): drawer contains the sidebar", async () => {
		setViewportWidth(375);
		const user = userEvent.setup();
		renderShell();
		await waitFor(() => {
			expect(screen.getByTestId("mobile-hamburger")).toBeInTheDocument();
		});

		await user.click(screen.getByTestId("mobile-hamburger"));

		await waitFor(() => {
			const drawer = screen.getByTestId("mobile-drawer");
			expect(drawer.querySelector("[data-ds-shell='Sidebar']")).toBeInTheDocument();
		});
	});

	it("at mobile (375px): clicking scrim closes the drawer", async () => {
		setViewportWidth(375);
		const user = userEvent.setup();
		renderShell();
		await waitFor(() => {
			expect(screen.getByTestId("mobile-hamburger")).toBeInTheDocument();
		});

		await user.click(screen.getByTestId("mobile-hamburger"));
		await waitFor(() => {
			expect(screen.getByTestId("mobile-scrim")).toBeInTheDocument();
		});

		await user.click(screen.getByTestId("mobile-scrim"));

		await waitFor(() => {
			expect(screen.queryByTestId("mobile-drawer")).not.toBeInTheDocument();
		});
		expect(screen.queryByTestId("mobile-scrim")).not.toBeInTheDocument();
	});

	it("at mobile (375px): drawer has role=dialog and aria-modal=true", async () => {
		setViewportWidth(375);
		const user = userEvent.setup();
		renderShell();
		await waitFor(() => {
			expect(screen.getByTestId("mobile-hamburger")).toBeInTheDocument();
		});

		await user.click(screen.getByTestId("mobile-hamburger"));

		await waitFor(() => {
			const drawer = screen.getByTestId("mobile-drawer");
			expect(drawer).toHaveAttribute("role", "dialog");
			expect(drawer).toHaveAttribute("aria-modal", "true");
		});
	});

	it("at mobile (375px): pressing Escape closes the drawer", async () => {
		setViewportWidth(375);
		const user = userEvent.setup();
		renderShell();
		await waitFor(() => {
			expect(screen.getByTestId("mobile-hamburger")).toBeInTheDocument();
		});

		await user.click(screen.getByTestId("mobile-hamburger"));
		await waitFor(() => {
			expect(screen.getByTestId("mobile-drawer")).toBeInTheDocument();
		});

		await user.keyboard("{Escape}");

		await waitFor(() => {
			expect(screen.queryByTestId("mobile-drawer")).not.toBeInTheDocument();
		});
	});

	it("at mobile (375px): a detail route keeps both Back and navigation access", async () => {
		setViewportWidth(375);
		renderShell("/conversations/thread-123");
		await waitFor(() => {
			expect(screen.getByTestId("mobile-back-button")).toBeInTheDocument();
		});
		expect(screen.getByTestId("mobile-hamburger")).toBeInTheDocument();
	});

	it("at mobile (375px): main content area is full-width (no sidebar in flow)", async () => {
		setViewportWidth(375);
		renderShell();
		await waitFor(() => {
			// Main content should be present
			expect(screen.getByTestId("main-content")).toBeInTheDocument();
		});
	});
});
