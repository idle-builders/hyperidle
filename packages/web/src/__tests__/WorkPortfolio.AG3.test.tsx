/**
 * AG3 — WorkPortfolio entry-point tests (red phase).
 *
 * AC2: BOTH "New bet" (toolbar) and "Create bet" (empty-state CTA) navigate to
 * /work/bet/new — no dialog opens for either.
 *
 * protectedTests:
 * - data-testid="new-bet-btn" present (frame invariant, AG2 AC-4)
 * - data-testid="create-bet-cta" present (AG2 R2 contract)
 * - CTA button label is exactly "Create bet" (R2 selector contract)
 * These must stay green after AG3 implementation.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkPortfolio } from "../pages/WorkPortfolio";

// Mock useTeams — WorkPortfolio uses this hook
vi.mock("../hooks/useTeams", () => ({
	useTeams: vi.fn().mockReturnValue({
		data: {
			teams: [
				{
					id: "team-1",
					name: "Alpha Team",
					status: "healthy",
					activeBets: 0,
					shipRate: "80%",
					leadAgentId: null,
					shipped: 0,
					progress: { done: 0, total: 0 },
					routineCount: 0,
					agentCount: 0,
					activeAgentCount: 0,
					agentHealthWarning: false,
				},
			],
		},
		loading: false,
		error: null,
	}),
}));

// useBets — empty by default to trigger empty state (showing the CTA)
const mockUseBets = vi.fn().mockReturnValue({
	bets: [],
	loading: false,
	error: null,
	refresh: vi.fn(),
});
vi.mock("../hooks/useBets", () => ({
	useBets: (...args: unknown[]) => mockUseBets(...args),
}));

// Spy on navigate — assert it's called with /work/bet/new, not that a dialog opens
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
	const original = await importOriginal<typeof import("react-router-dom")>();
	return {
		...original,
		useNavigate: () => mockNavigate,
	};
});

afterEach(() => {
	vi.clearAllMocks();
	mockUseBets.mockReturnValue({
		bets: [],
		loading: false,
		error: null,
		refresh: vi.fn(),
	});
});

function renderPage(): ReturnType<typeof render> {
	return render(
		<MemoryRouter>
			<WorkPortfolio />
		</MemoryRouter>,
	);
}

// ─── AG2 frame invariants that must stay green ────────────────────────────────

describe("AG2 frame invariants (must remain green after AG3)", () => {
	it("renders new-bet-btn in the toolbar", () => {
		renderPage();
		expect(screen.getByTestId("new-bet-btn")).toBeInTheDocument();
	});

	it("renders create-bet-cta in empty state", () => {
		renderPage();
		expect(screen.getByTestId("create-bet-cta")).toBeInTheDocument();
	});

	it("CTA button label is exactly 'Create bet'", () => {
		renderPage();
		expect(screen.getByRole("button", { name: /^create bet$/i })).toBeInTheDocument();
	});
});

// ─── AC2: Both entry points navigate to /work/bet/new ─────────────────────────

describe("AC2 — New-bet entry points navigate (no dialog)", () => {
	it("toolbar 'New bet' button navigates to /work/bet/new", async () => {
		const user = userEvent.setup();
		renderPage();

		await user.click(screen.getByTestId("new-bet-btn"));

		expect(mockNavigate).toHaveBeenCalledWith("/work/bet/new");
	});

	it("toolbar 'New bet' button does NOT open a dialog", async () => {
		const user = userEvent.setup();
		renderPage();

		await user.click(screen.getByTestId("new-bet-btn"));

		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	it("empty-state 'Create bet' CTA button navigates to /work/bet/new", async () => {
		const user = userEvent.setup();
		renderPage();

		await user.click(screen.getByRole("button", { name: /^create bet$/i }));

		expect(mockNavigate).toHaveBeenCalledWith("/work/bet/new");
	});

	it("empty-state 'Create bet' CTA does NOT open a dialog", async () => {
		const user = userEvent.setup();
		renderPage();

		await user.click(screen.getByRole("button", { name: /^create bet$/i }));

		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});
});
