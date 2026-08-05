/**
 * FirstRunRedirect unit tests — N5 bug fix + P4 update.
 *
 * @lore N5: The .catch() block was defaulting to /conversations instead of
 * the setup route. On a fresh install, any API failure should show setup,
 * not a broken conversations view.
 *
 * @lore P4: Updated from /onboarding to /setup. The component now checks
 * both human user existence (GET /api/auth/me) AND products (GET /api/products)
 * in parallel. Redirects to /setup if either check fails.
 *
 * Uses vitest's global fetch mock (vi.stubGlobal) to control
 * apiFetch's underlying fetch. The component is rendered in MemoryRouter
 * with stub routes at /setup and /conversations so we can observe
 * the final navigation destination via rendered text.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstRunRedirect } from "../pages/FirstRunRedirect";

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

function SetupStub(): React.JSX.Element {
	return <div data-testid="landing">setup</div>;
}

function ConversationsStub(): React.JSX.Element {
	return <div data-testid="landing">conversations</div>;
}

// AD9: /work/portfolio retired → /work is the new landing
function WorkOverviewStub(): React.JSX.Element {
	return <div data-testid="landing">work-overview</div>;
}

function renderFirstRunRedirect(): typeof screen {
	render(
		<MemoryRouter initialEntries={["/"]}>
			<Routes>
				<Route path="/" element={<FirstRunRedirect />} />
				<Route path="/setup" element={<SetupStub />} />
				<Route path="/conversations" element={<ConversationsStub />} />
				<Route path="/work" element={<WorkOverviewStub />} />
			</Routes>
		</MemoryRouter>,
	);
	return screen;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterEach(() => {
	vi.restoreAllMocks();
});

describe("FirstRunRedirect (N5 + P4)", () => {
	// P4: no products and no user → /setup
	it("redirects to /setup when there are no products (fresh install)", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation((url: string) => {
				if (url.includes("/api/auth/me")) {
					return Promise.resolve({ ok: false, status: 401, json: async () => ({}) });
				}
				return Promise.resolve({
					ok: true,
					json: async () => ({ teams: [] }),
				});
			}),
		);

		renderFirstRunRedirect();

		await waitFor(() => {
			expect(screen.getByTestId("landing")).toHaveTextContent("setup");
		});
	});

	// AD9: Both user and products exist → /work (was /work/portfolio)
	it("redirects to /work when user and products exist", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation((url: string) => {
				if (url.includes("/api/auth/me")) {
					return Promise.resolve({ ok: true, json: async () => ({ id: "u-1" }) });
				}
				return Promise.resolve({
					ok: true,
					// @lore U1: /api/products now returns { teams: [...] } not { products: [...] }
					json: async () => ({ teams: [{ id: "p1", name: "My App" }] }),
				});
			}),
		);

		renderFirstRunRedirect();

		await waitFor(() => {
			expect(screen.getByTestId("landing")).toHaveTextContent("work-overview");
		});
	});

	// P4 + N5: API failure → /setup (not /conversations)
	it("redirects to /setup when the API call fails (network error)", async () => {
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

		renderFirstRunRedirect();

		await waitFor(() => {
			expect(screen.getByTestId("landing")).toHaveTextContent("setup");
		});
	});

	// P4: auth/me 401 → /setup even when products exist
	it("redirects to /setup when the API returns a non-ok response for auth/me", async () => {
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
				return Promise.resolve({
					ok: true,
					json: async () => ({ teams: [{ id: "t1", name: "My App" }] }),
				});
			}),
		);

		renderFirstRunRedirect();

		await waitFor(() => {
			expect(screen.getByTestId("landing")).toHaveTextContent("setup");
		});
	});
});
