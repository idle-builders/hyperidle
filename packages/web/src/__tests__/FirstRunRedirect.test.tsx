/**
 * FirstRunRedirect unit tests — N5 bug fix.
 *
 * Verifies that the first-run redirect component sends users to /onboarding
 * when there are no products (fresh install) AND when the API call fails
 * (network error, auth timing, etc.).
 *
 * The bug: the .catch() block was defaulting to /conversations instead of
 * /onboarding. On a fresh install, any API failure should show onboarding,
 * not a broken conversations view.
 *
 * @lore N5: Uses vitest's global fetch mock (vi.stubGlobal) to control
 * apiFetch's underlying fetch. The component is rendered in MemoryRouter
 * with stub routes at /onboarding and /conversations so we can observe
 * the final navigation destination via rendered text.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstRunRedirect } from "../pages/FirstRunRedirect";

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

function OnboardingStub(): React.JSX.Element {
	return <div data-testid="landing">onboarding</div>;
}

function ConversationsStub(): React.JSX.Element {
	return <div data-testid="landing">conversations</div>;
}

function renderFirstRunRedirect(): typeof screen {
	render(
		<MemoryRouter initialEntries={["/"]}>
			<Routes>
				<Route path="/" element={<FirstRunRedirect />} />
				<Route path="/onboarding" element={<OnboardingStub />} />
				<Route path="/conversations" element={<ConversationsStub />} />
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

describe("FirstRunRedirect (N5)", () => {
	it("redirects to /onboarding when there are no products (fresh install)", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ products: [] }),
			}),
		);

		renderFirstRunRedirect();

		await waitFor(() => {
			expect(screen.getByTestId("landing")).toHaveTextContent("onboarding");
		});
	});

	it("redirects to /conversations when products exist", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ products: [{ id: "p1", name: "My App" }] }),
			}),
		);

		renderFirstRunRedirect();

		await waitFor(() => {
			expect(screen.getByTestId("landing")).toHaveTextContent("conversations");
		});
	});

	it("redirects to /onboarding when the API call fails (network error)", async () => {
		// BUG N5: the .catch() block was routing to /conversations.
		// On a fresh install, any API failure should show onboarding.
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

		renderFirstRunRedirect();

		await waitFor(() => {
			expect(screen.getByTestId("landing")).toHaveTextContent("onboarding");
		});
	});

	it("redirects to /onboarding when the API returns a non-ok response", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: false,
				status: 401,
				json: async () => ({ error: "Unauthorized" }),
			}),
		);

		renderFirstRunRedirect();

		await waitFor(() => {
			expect(screen.getByTestId("landing")).toHaveTextContent("onboarding");
		});
	});
});
