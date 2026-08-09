/**
 * P5 — Hint view integration tests (Task 5/6, AC5 + AC6 + AC7)
 *
 * AC coverage:
 * AC5a: Hint #1 ("create-bet") appears on WorkTeam when activeBets is empty
 *   and hint is not dismissed. Element has correct data-testid.
 * AC5b: Hint #1 text matches the catalog copy.
 * AC5c: Hint does not appear when trigger condition is false (activeBets exist).
 * AC5d: Hint does not appear when already dismissed.
 * AC6: Hint disappears after clicking "Got it" button.
 *
 * Tests use HintProvider with mocked fetch to control dismissed state.
 * WorkTeam is rendered with fixture data (overrideData) to control trigger.
 *
 * @lore U5: Updated from WorkProduct/ProductDetail → WorkTeam/TeamDetail.
 */

import type { TeamDetail } from "@hyperidle/domain-model";
import { HINT_CATALOG } from "@hyperidle/domain-model";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HintProvider } from "../hooks/useHints";
import { WorkTeam } from "../pages/WorkTeam";

// AgentEditDialog (rendered inside WorkTeam) calls useToast on mount.
// These tests are about hints, not toasts — mock the hook to avoid the
// "must be used within <ToastRegion>" error.
// @lore AB3: AgentEditDialog always mounts inside WorkTeam, so any WorkTeam
// render in tests needs either a <ToastRegion> wrapper or a useToast mock.
vi.mock("../shell/ToastRegion.js", async () => {
	const actual = await vi.importActual("../shell/ToastRegion.js");
	return {
		...actual,
		useToast: vi.fn(() => ({ showToast: vi.fn() })),
	};
});

// --- Fixtures ---

const BASE_TEAM_DETAIL: TeamDetail = {
	team: {
		id: "p1",
		name: "Test Team",
		phase: "build",
		status: "healthy",
		leadAgentId: null,
	},
	teamMembers: {
		id: "t1",
		formedAt: "2026-01-01T00:00:00.000Z",
		dissolvedAt: null,
	},
	roster: [],
	burn: {
		capacity: 5,
		activeBets: 0,
	},
	activeBets: [],
};

const TEAM_WITH_ACTIVE_BET: TeamDetail = {
	...BASE_TEAM_DETAIL,
	burn: {
		...BASE_TEAM_DETAIL.burn,
		activeBets: 1,
	},
	activeBets: [
		{
			id: "b1",
			descriptionTitle: "Active bet",
			status: "active",
			progressDone: 0,
			progressTotal: 3,
		},
	],
};

// --- Helpers ---

function renderWithHints(ui: ReactNode, path = "/work/product/p1"): ReturnType<typeof render> {
	return render(
		<HintProvider>
			<MemoryRouter initialEntries={[path]}>
				<Routes>
					<Route path="/work/product/:productId" element={ui} />
					<Route path="*" element={ui} />
				</Routes>
			</MemoryRouter>
		</HintProvider>,
	);
}

const CREATE_BET_HINT_ENTRY = HINT_CATALOG.find((h) => h.id === "create-bet");
if (!CREATE_BET_HINT_ENTRY) throw new Error("create-bet hint not found in catalog");
const CREATE_BET_HINT = CREATE_BET_HINT_ENTRY;

// --- Tests ---

describe("P5 AC5: Hint #1 (create-bet) on WorkTeam", () => {
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchSpy = vi.fn();
		global.fetch = fetchSpy as unknown as typeof fetch;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// AC5a: Hint appears when activeBets is empty and hint not dismissed
	it("hint-create-bet element is visible when there are zero active bets and hint is not dismissed", async () => {
		fetchSpy.mockResolvedValueOnce(
			new Response(JSON.stringify({ dismissed: [] }), { status: 200 }),
		);

		renderWithHints(<WorkTeam overrideData={BASE_TEAM_DETAIL} skipArtifacts />);

		await waitFor(() => {
			expect(screen.getByTestId("hint-create-bet")).toBeInTheDocument();
		});
	});

	// AC5b: Hint text matches catalog copy
	it("hint-create-bet text matches the catalog copy", async () => {
		fetchSpy.mockResolvedValueOnce(
			new Response(JSON.stringify({ dismissed: [] }), { status: 200 }),
		);

		renderWithHints(<WorkTeam overrideData={BASE_TEAM_DETAIL} skipArtifacts />);

		await waitFor(() => {
			expect(screen.getByTestId("hint-create-bet")).toBeInTheDocument();
		});

		expect(screen.getByText(CREATE_BET_HINT.copy)).toBeInTheDocument();
	});

	// AC5c: Hint does NOT appear when trigger condition is false (active bets exist)
	it("hint-create-bet is absent when active bets exist (trigger condition false)", async () => {
		fetchSpy.mockResolvedValueOnce(
			new Response(JSON.stringify({ dismissed: [] }), { status: 200 }),
		);

		renderWithHints(<WorkTeam overrideData={TEAM_WITH_ACTIVE_BET} skipArtifacts />);

		await waitFor(() => {
			// Wait for the API fetch to complete
			expect(fetchSpy).toHaveBeenCalledTimes(1);
		});

		expect(screen.queryByTestId("hint-create-bet")).not.toBeInTheDocument();
	});

	// AC5d: Hint does NOT appear when already dismissed
	it("hint-create-bet is absent when the hint is already dismissed", async () => {
		fetchSpy.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					dismissed: [{ hintId: "create-bet", seenAt: "2026-05-27T10:00:00.000Z" }],
				}),
				{ status: 200 },
			),
		);

		renderWithHints(<WorkTeam overrideData={BASE_TEAM_DETAIL} skipArtifacts />);

		await waitFor(() => {
			expect(fetchSpy).toHaveBeenCalledTimes(1);
		});

		// Hint must not appear even though trigger condition is true (no active bets)
		expect(screen.queryByTestId("hint-create-bet")).not.toBeInTheDocument();
	});

	// AC6: Hint disappears after clicking "Got it"
	it("hint-create-bet disappears from the DOM after clicking 'Got it'", async () => {
		const user = userEvent.setup();

		fetchSpy.mockResolvedValueOnce(
			new Response(JSON.stringify({ dismissed: [] }), { status: 200 }),
		);
		// POST dismiss fire-and-forget response
		fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

		renderWithHints(<WorkTeam overrideData={BASE_TEAM_DETAIL} skipArtifacts />);

		// Wait for hint to appear
		await waitFor(() => {
			expect(screen.getByTestId("hint-create-bet")).toBeInTheDocument();
		});

		// Click "Got it"
		const gotItBtn = screen.getByRole("button", { name: /got it/i });
		await user.click(gotItBtn);

		// Hint should disappear immediately (optimistic update)
		expect(screen.queryByTestId("hint-create-bet")).not.toBeInTheDocument();
	});

	// Hint has role="status" for accessibility (reviewer warning)
	it("hint-create-bet region has accessible role for screen readers", async () => {
		fetchSpy.mockResolvedValueOnce(
			new Response(JSON.stringify({ dismissed: [] }), { status: 200 }),
		);

		renderWithHints(<WorkTeam overrideData={BASE_TEAM_DETAIL} skipArtifacts />);

		await waitFor(() => {
			expect(screen.getByTestId("hint-create-bet")).toBeInTheDocument();
		});

		// The hint container should be accessible as a status region
		const hintEl = screen.getByTestId("hint-create-bet");
		expect(hintEl).toBeInTheDocument();
		// role="status" or equivalent accessible landmark
		expect(hintEl.getAttribute("role")).toBe("status");
	});

	// AC7: Hint does not appear when dismissed (simulates page reload with dismissed state)
	it("hint-create-bet does not reappear after dismissal — API returns it as dismissed", async () => {
		// Simulate page reload: API now returns create-bet as dismissed
		fetchSpy.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					dismissed: [{ hintId: "create-bet", seenAt: "2026-05-27T10:00:00.000Z" }],
				}),
				{ status: 200 },
			),
		);

		renderWithHints(<WorkTeam overrideData={BASE_TEAM_DETAIL} skipArtifacts />);

		await waitFor(() => {
			expect(fetchSpy).toHaveBeenCalledTimes(1);
		});

		expect(screen.queryByTestId("hint-create-bet")).not.toBeInTheDocument();
	});

	// Graceful degradation: hint not shown when API fails
	it("hint-create-bet is absent when the hint progress API fails", async () => {
		fetchSpy.mockResolvedValueOnce(
			new Response(JSON.stringify({ error: "Server error" }), { status: 500 }),
		);

		renderWithHints(<WorkTeam overrideData={BASE_TEAM_DETAIL} skipArtifacts />);

		await waitFor(() => {
			expect(fetchSpy).toHaveBeenCalledTimes(1);
		});

		expect(screen.queryByTestId("hint-create-bet")).not.toBeInTheDocument();
	});
});
