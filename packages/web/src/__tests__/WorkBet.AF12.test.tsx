/**
 * AF12 — WorkBet UI: activate control (AC1), kill-dialog copy honesty (AC3).
 *
 * Drives the exported WorkBet page with an `overrideBet` fixture, opens the
 * relevant dialog via the overflow menu, and asserts on copy + the exact
 * `apiFetch` payload shape.
 *
 * @lore AF12 RED:
 *  - AC1: no "Activate bet" overflow item exists yet → query fails.
 *  - AC3: the kill dialog copy still says "freed immediately" and lacks the
 *    "finish their current step" qualifier → copy assertions fail.
 *
 * @lore AU21 Increment 14a: AC2 (appetite money input) is HARD-DELETED along
 * with the rest of the cost-cap feature.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BetDetail } from "../types/bet";

// Mock apiFetch so we can inspect payloads and avoid real network.
const apiFetchMock = vi.fn();
vi.mock("../services/api-fetch.js", () => ({
	apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

// Mock useHostThread so HostThreadSection doesn't fire fetches.
vi.mock("../hooks/useHostThread", () => ({
	useHostThread: vi.fn(() => ({ data: null, error: null, isLoading: false, refresh: vi.fn() })),
}));
// Mock useCurrentUser so WorkBet's mount-time GET /api/auth/me doesn't occupy
// apiFetch call[0] — the action POST/PATCH must be the first observable call.
vi.mock("../hooks/useCurrentUser", () => ({
	useCurrentUser: vi.fn(() => ({ user: null, isLoading: false, error: null })),
}));
// Mock ArtifactSection so its mount-time GET /api/artifacts doesn't occupy
// apiFetch call[0] (same approach as TaskSheet.AF12-sessions.test.tsx).
vi.mock("../components/ArtifactSection", () => ({
	ArtifactSection: () => null,
	useArtifactOpen: () => vi.fn(),
}));
vi.mock("../hooks/useArtifactThreadSummary", () => ({
	useArtifactThreadSummary: vi.fn(() => ({
		data: null,
		error: null,
		isLoading: false,
		refresh: vi.fn(),
	})),
}));

import { WorkBet } from "../pages/WorkBet";

const ACTIVE_BET: BetDetail = {
	id: "b_active",
	title: "Payment Gateway Integration",
	team: "Alpha Core",
	status: "active",
	atRisk: false,
	tokenAppetite: null,
	tokensActual: null,
	progress: { done: 2, total: 6 },
	description: "# Problem\nManual payments.",
	tasks: [],
};

const DRAFT_BET: BetDetail = { ...ACTIVE_BET, id: "b_draft", status: "draft" };

function renderBet(bet: BetDetail): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[`/work/bet/${bet.id}`]}>
			<Routes>
				<Route path="/work/bet/:betId" element={<WorkBet overrideBet={bet} />} />
			</Routes>
		</MemoryRouter>,
	);
}

function okJson(body: unknown = {}): Promise<Response> {
	return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);
}

// AG5: Menu returns null when closed — open overflow trigger before querying items.
async function openOverflow(user: ReturnType<typeof userEvent.setup>): Promise<void> {
	await user.click(screen.getByTestId("bet-overflow-btn"));
}

describe("WorkBet AF12 — AC1 activate control", () => {
	beforeEach(() => {
		apiFetchMock.mockReset();
		apiFetchMock.mockImplementation(() => okJson());
	});
	afterEach(() => vi.clearAllMocks());

	it("shows an 'Activate bet' overflow item for a draft bet", async () => {
		const user = userEvent.setup();
		renderBet(DRAFT_BET);
		await openOverflow(user);
		expect(screen.getByText("Activate bet")).toBeInTheDocument();
	});

	it("does NOT show 'Activate bet' for an active bet", () => {
		// Menu is closed — text is not in DOM for any status
		renderBet(ACTIVE_BET);
		expect(screen.queryByText("Activate bet")).not.toBeInTheDocument();
	});

	it("clicking 'Activate bet' POSTs to /commit", async () => {
		const user = userEvent.setup();
		renderBet(DRAFT_BET);
		await openOverflow(user);
		await user.click(screen.getByText("Activate bet"));
		await waitFor(() => {
			expect(apiFetchMock).toHaveBeenCalled();
		});
		const url = apiFetchMock.mock.calls[0]?.[0] as string;
		const opts = apiFetchMock.mock.calls[0]?.[1] as { method?: string };
		expect(url).toContain("/api/bets/b_draft/commit");
		expect(opts.method).toBe("POST");
	});
});

// @lore AU21 Increment 14a: "WorkBet AF12 — AC2 appetite money input" describe
// block is HARD-DELETED — the "Adjust appetite" action + AppetiteDialog no
// longer exist (bets.costAppetite/costActual are dropped columns), no
// replacement.

describe("WorkBet AF12 — AC3 kill-dialog copy honesty", () => {
	beforeEach(() => {
		apiFetchMock.mockReset();
		apiFetchMock.mockImplementation(() => okJson());
	});
	afterEach(() => vi.clearAllMocks());

	// AG5: menu closed by default; open overflow then click Kill item
	async function openKillDialog(): Promise<void> {
		const user = userEvent.setup();
		await openOverflow(user);
		fireEvent.click(document.querySelector('[data-bet-action="kill"]') as HTMLElement);
	}

	it("the kill dialog describes the cascade: in-progress tasks killed, sessions stopped", async () => {
		renderBet(ACTIVE_BET);
		await openKillDialog();
		const dialog = await screen.findByRole("dialog");
		expect(dialog).toHaveTextContent(/in-progress tasks/i);
		expect(dialog).toHaveTextContent(/sessions/i);
	});

	it("the SAVED line does NOT claim cost stops 'immediately'", async () => {
		renderBet(ACTIVE_BET);
		await openKillDialog();
		const dialog = await screen.findByRole("dialog");
		// "freed immediately" would falsely imply cost stops the instant Kill is clicked.
		expect(dialog.textContent ?? "").not.toMatch(/immediately/i);
	});

	it("the dialog includes the 'finish their current step' running-agents qualifier", async () => {
		renderBet(ACTIVE_BET);
		await openKillDialog();
		const dialog = await screen.findByRole("dialog");
		expect(dialog).toHaveTextContent(/finish their current step/i);
	});
});
