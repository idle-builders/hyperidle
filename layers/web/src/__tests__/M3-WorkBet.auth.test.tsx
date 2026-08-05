/**
 * M3 RED — WorkBet: uses useCurrentUser, no hardcoded founder ID (A12).
 *
 * These tests FAIL until:
 *  - FOUNDER_ID constant is deleted from WorkBet.tsx
 *  - useCurrentUser() is called in WorkBet
 *  - FOUNDER_ID usages replaced with user?.id ?? ""
 */

import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MOCK_BETS } from "../pages/__fixtures__/work-bet-fixtures";
import { WorkBet } from "../pages/WorkBet";

// Mock useCurrentUser to inject a known user id
vi.mock("../hooks/useCurrentUser", () => ({
	useCurrentUser: vi.fn(),
}));

import { useCurrentUser } from "../hooks/useCurrentUser";

function renderPage(overrideBet = MOCK_BETS.b1!): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[`/work/bet/${overrideBet.id}`]}>
			<Routes>
				<Route path="/work/bet/:betId" element={<WorkBet overrideBet={overrideBet} />} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("M3 — WorkBet: uses useCurrentUser, not FOUNDER_ID constant (A12)", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("calls useCurrentUser hook to get the user id", () => {
		vi.mocked(useCurrentUser).mockReturnValue({
			user: { id: "mock-user-from-hook", name: "Mock User", email: "m@test.com", avatarUrl: null },
			status: "ready",
			error: null,
		});

		renderPage();

		expect(useCurrentUser).toHaveBeenCalled();
	});

	it("does not render 'u-founder' string in the DOM", async () => {
		vi.mocked(useCurrentUser).mockReturnValue({
			user: { id: "mock-user-from-hook", name: "Mock User", email: "m@test.com", avatarUrl: null },
			status: "ready",
			error: null,
		});

		const { container } = renderPage();

		await waitFor(() => {
			expect(screen.getByTestId("work-bet-page")).toBeInTheDocument();
		});

		// The hardcoded "u-founder" string must NOT appear in the DOM
		expect(container.textContent).not.toContain("u-founder");
	});

	it("page still renders when useCurrentUser returns loading status", async () => {
		vi.mocked(useCurrentUser).mockReturnValue({
			user: null,
			status: "loading",
			error: null,
		});

		renderPage();

		await waitFor(() => {
			expect(screen.getByTestId("work-bet-page")).toBeInTheDocument();
		});
	});
});
