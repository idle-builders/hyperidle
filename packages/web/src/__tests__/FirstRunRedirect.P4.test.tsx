/**
 * P4 — FirstRunRedirect tests for the updated setup completion check.
 *
 * AC-10: FirstRunRedirect checks for human user + product (not just products)
 *
 * The P4 update changes FirstRunRedirect to check:
 * 1. GET /api/auth/me — 200 means user exists, 401/404 means no user
 * 2. GET /api/products — products.length > 0
 * If either check fails, redirect to /setup instead of /onboarding.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstRunRedirect } from "../pages/FirstRunRedirect";

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

afterEach(() => {
	vi.restoreAllMocks();
});

describe("FirstRunRedirect (P4) — setup completion check", () => {
	// AC-10: when no human user, redirect to /setup
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
						json: async () => ({ teams: [{ id: "t1", name: "My App" }] }),
					});
				}
				return Promise.resolve({ ok: true, json: async () => ({}) });
			}),
		);

		renderFirstRunRedirect();

		await waitFor(() => {
			expect(screen.getByTestId("landing")).toHaveTextContent("setup");
		});
	});

	// AC-10: when no teams, redirect to /setup
	it("redirects to /setup when products list is empty (DB with user but no products)", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation((url: string) => {
				if (url.includes("/api/auth/me")) {
					return Promise.resolve({
						ok: true,
						json: async () => ({
							id: "u-1",
							name: "Founder",
							email: "f@example.com",
							avatarUrl: null,
						}),
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

		renderFirstRunRedirect();

		await waitFor(() => {
			expect(screen.getByTestId("landing")).toHaveTextContent("setup");
		});
	});

	// AD9: when user exists + products exist, redirect to /work (not /work/portfolio)
	it("redirects to /work when human user exists and products exist", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation((url: string) => {
				if (url.includes("/api/auth/me")) {
					return Promise.resolve({
						ok: true,
						json: async () => ({
							id: "u-1",
							name: "Founder",
							email: "f@example.com",
							avatarUrl: null,
						}),
					});
				}
				if (url.includes("/api/teams")) {
					return Promise.resolve({
						ok: true,
						// @lore U1: /api/products now returns { teams: [...] } (renamed from { products: [...] })
						json: async () => ({ teams: [{ id: "p1", name: "My App" }] }),
					});
				}
				return Promise.resolve({ ok: true, json: async () => ({}) });
			}),
		);

		renderFirstRunRedirect();

		await waitFor(() => {
			expect(screen.getByTestId("landing")).toHaveTextContent("work-overview");
		});
	});

	// Error case: API failure redirects to /setup (not /conversations)
	it("redirects to /setup on API failure (not /conversations)", async () => {
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

		renderFirstRunRedirect();

		await waitFor(() => {
			expect(screen.getByTestId("landing")).toHaveTextContent("setup");
		});
	});

	// No /onboarding route — FirstRunRedirect no longer redirects to /onboarding
	it("never redirects to /onboarding (old route replaced with /setup)", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation(() =>
				Promise.resolve({
					ok: true,
					json: async () => ({ teams: [] }),
				}),
			),
		);

		render(
			<MemoryRouter initialEntries={["/"]}>
				<Routes>
					<Route path="/" element={<FirstRunRedirect />} />
					<Route path="/setup" element={<SetupStub />} />
					<Route path="/onboarding" element={<div data-testid="landing">onboarding</div>} />
					<Route path="/conversations" element={<ConversationsStub />} />
				</Routes>
			</MemoryRouter>,
		);

		await waitFor(() => {
			// Should go to /setup, not /onboarding
			expect(screen.getByTestId("landing")).toHaveTextContent("setup");
			expect(screen.getByTestId("landing")).not.toHaveTextContent("onboarding");
		});
	});
});
