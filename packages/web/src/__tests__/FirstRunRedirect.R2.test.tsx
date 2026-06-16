/**
 * AD9 migration — FirstRunRedirect redirect-target tests.
 *
 * AD9: After setup completion, the app routes to /work (not /work/portfolio).
 * The intent (land on the Work surface, not Conversations) is preserved —
 * only the path changes from /work/portfolio → /work.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstRunRedirect } from "../pages/FirstRunRedirect";

function SetupStub(): React.JSX.Element {
	return <div data-testid="landing">setup</div>;
}

// AD9: /work/portfolio retired → /work is the landing
function WorkOverviewStub(): React.JSX.Element {
	return <div data-testid="landing">work-overview</div>;
}

function ConversationsStub(): React.JSX.Element {
	return <div data-testid="landing">conversations</div>;
}

/**
 * Render with /work and /conversations routes so we can detect which one the component navigates to.
 */
function renderFirstRunRedirectWithPortfolio(): typeof screen {
	render(
		<MemoryRouter initialEntries={["/"]}>
			<Routes>
				<Route path="/" element={<FirstRunRedirect />} />
				<Route path="/setup" element={<SetupStub />} />
				<Route path="/work" element={<WorkOverviewStub />} />
				<Route path="/conversations" element={<ConversationsStub />} />
			</Routes>
		</MemoryRouter>,
	);
	return screen;
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("FirstRunRedirect (AD9) — /work redirect target", () => {
	// AD9: when user exists + products exist, redirect to /work (not /work/portfolio, not /conversations)
	it("redirects to /work (not /conversations) when human user exists and products exist", async () => {
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
				if (url.includes("/api/teams")) {
					return Promise.resolve({
						ok: true,
						// @lore U1: endpoint renamed /api/products → /api/teams, response shape { teams: [...] }
						json: async () => ({ teams: [{ id: "p1", name: "My App" }] }),
					});
				}
				return Promise.resolve({ ok: true, json: async () => ({}) });
			}),
		);

		renderFirstRunRedirectWithPortfolio();

		await waitFor(() => {
			// Must land on work-overview, not conversations
			expect(screen.getByTestId("landing")).toHaveTextContent("work-overview");
		});
	});

	// AD9: must NOT redirect to /conversations when setup is complete
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
				if (url.includes("/api/teams")) {
					return Promise.resolve({
						ok: true,
						json: async () => ({ teams: [{ id: "p1", name: "My App" }] }),
					});
				}
				return Promise.resolve({ ok: true, json: async () => ({}) });
			}),
		);

		renderFirstRunRedirectWithPortfolio();

		await waitFor(() => {
			expect(screen.getByTestId("landing")).not.toHaveTextContent("conversations");
			expect(screen.getByTestId("landing")).toHaveTextContent("work-overview");
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
				if (url.includes("/api/teams")) {
					return Promise.resolve({
						ok: true,
						json: async () => ({ teams: [{ id: "p1", name: "My App" }] }),
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
				if (url.includes("/api/teams")) {
					return Promise.resolve({
						ok: true,
						json: async () => ({ teams: [] }),
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
