/**
 * R2 — FirstRunRedirect tests for the updated redirect target.
 *
 * R2 AC-5: After setup completion, the app routes to /work/portfolio (not /conversations).
 *
 * The R2 update changes FirstRunRedirect so that when user exists AND products exist,
 * it redirects to /work/portfolio instead of /conversations.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstRunRedirect } from "../pages/FirstRunRedirect";

function SetupStub(): React.JSX.Element {
	return <div data-testid="landing">setup</div>;
}

function WorkPortfolioStub(): React.JSX.Element {
	return <div data-testid="landing">work-portfolio</div>;
}

function ConversationsStub(): React.JSX.Element {
	return <div data-testid="landing">conversations</div>;
}

/**
 * Render with both /work/portfolio and /conversations routes so we can detect
 * which one the component navigates to.
 */
function renderFirstRunRedirectWithPortfolio(): typeof screen {
	render(
		<MemoryRouter initialEntries={["/"]}>
			<Routes>
				<Route path="/" element={<FirstRunRedirect />} />
				<Route path="/setup" element={<SetupStub />} />
				<Route path="/work/portfolio" element={<WorkPortfolioStub />} />
				<Route path="/conversations" element={<ConversationsStub />} />
			</Routes>
		</MemoryRouter>,
	);
	return screen;
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("FirstRunRedirect (R2) — /work/portfolio redirect", () => {
	// R2 AC-5: when user exists + products exist, redirect to /work/portfolio (not /conversations)
	it("redirects to /work/portfolio (not /conversations) when human user exists and products exist", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation((url: string) => {
				if (url.includes("/api/auth/me")) {
					return Promise.resolve({
						ok: true,
						json: async () => ({
							id: "u-1",
							name: "Founder",
							avatarUrl: null,
						}),
					});
				}
				if (url.includes("/api/products")) {
					return Promise.resolve({
						ok: true,
						json: async () => ({ products: [{ id: "p1", name: "My App" }] }),
					});
				}
				return Promise.resolve({ ok: true, json: async () => ({}) });
			}),
		);

		renderFirstRunRedirectWithPortfolio();

		await waitFor(() => {
			// Must land on work-portfolio, not conversations
			expect(screen.getByTestId("landing")).toHaveTextContent("work-portfolio");
		});
	});

	// R2 AC-5: must NOT redirect to /conversations when setup is complete
	it("does NOT redirect to /conversations when user and products exist", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation((url: string) => {
				if (url.includes("/api/auth/me")) {
					return Promise.resolve({
						ok: true,
						json: async () => ({ id: "u-1", name: "Founder", avatarUrl: null }),
					});
				}
				if (url.includes("/api/products")) {
					return Promise.resolve({
						ok: true,
						json: async () => ({ products: [{ id: "p1", name: "My App" }] }),
					});
				}
				return Promise.resolve({ ok: true, json: async () => ({}) });
			}),
		);

		renderFirstRunRedirectWithPortfolio();

		await waitFor(() => {
			expect(screen.getByTestId("landing")).not.toHaveTextContent("conversations");
		});
	});

	// Existing behavior: no user → /setup (unchanged)
	it("redirects to /setup when auth/me returns 401 (no human user)", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation((url: string) => {
				if (url.includes("/api/auth/me")) {
					return Promise.resolve({
						ok: false,
						status: 401,
						json: async () => ({ error: "Unauthorized" }),
					});
				}
				if (url.includes("/api/products")) {
					return Promise.resolve({
						ok: true,
						json: async () => ({ products: [{ id: "p1", name: "My App" }] }),
					});
				}
				return Promise.resolve({ ok: true, json: async () => ({}) });
			}),
		);

		renderFirstRunRedirectWithPortfolio();

		await waitFor(() => {
			expect(screen.getByTestId("landing")).toHaveTextContent("setup");
		});
	});

	// Existing behavior: no products → /setup (unchanged)
	it("redirects to /setup when products list is empty", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation((url: string) => {
				if (url.includes("/api/auth/me")) {
					return Promise.resolve({
						ok: true,
						json: async () => ({ id: "u-1", name: "Founder", avatarUrl: null }),
					});
				}
				if (url.includes("/api/products")) {
					return Promise.resolve({
						ok: true,
						json: async () => ({ products: [] }),
					});
				}
				return Promise.resolve({ ok: true, json: async () => ({}) });
			}),
		);

		renderFirstRunRedirectWithPortfolio();

		await waitFor(() => {
			expect(screen.getByTestId("landing")).toHaveTextContent("setup");
		});
	});
});
