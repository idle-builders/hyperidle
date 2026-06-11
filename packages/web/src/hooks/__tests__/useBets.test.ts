/**
 * U9 — useBets hook tests.
 *
 * New hook that fetches GET /api/bets and flattens the grouped response
 * into a single flat array for the WorkPortfolio bet grid.
 *
 * AC covered: AC-2 (hook provides data for bet grid)
 *
 * RED PHASE: these tests are written before the hook is implemented.
 */

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../services/api-fetch.js", () => ({
	apiFetch: vi.fn(),
}));

import { apiFetch } from "../../services/api-fetch.js";
import { useBets } from "../useBets";

const mockApiFetch = vi.mocked(apiFetch);

const MOCK_BETS_RESPONSE = {
	draft: [
		{
			id: "bet-draft-1",
			title: "Draft Bet",
			teamId: "team-1",
			description: "A draft bet",
			status: "draft",
			atRisk: false,
			costAppetite: null,
		},
	],
	active: [
		{
			id: "bet-active-1",
			title: "Active Bet",
			teamId: "team-2",
			description: "An active bet",
			status: "active",
			atRisk: false,
			costAppetite: null,
		},
	],
	completed: [
		{
			id: "bet-completed-1",
			title: "Completed Bet",
			teamId: "team-1",
			description: "A completed bet",
			status: "completed",
			atRisk: false,
			costAppetite: null,
		},
	],
	killed: [],
};

function makeMockFetch(
	data: unknown,
	ok = true,
): (_input: string | URL | Request, _init?: RequestInit) => Promise<Response> {
	return vi.fn().mockResolvedValue({
		ok,
		status: ok ? 200 : 500,
		json: vi.fn().mockResolvedValue(data),
	}) as (_input: string | URL | Request, _init?: RequestInit) => Promise<Response>;
}

afterEach(() => {
	vi.clearAllMocks();
});

describe("useBets hook (U9)", () => {
	it("initially returns loading=true", () => {
		mockApiFetch.mockReturnValue(new Promise(() => {})); // never resolves
		const { result } = renderHook(() => useBets());
		expect(result.current.loading).toBe(true);
		expect(result.current.bets).toEqual([]);
		expect(result.current.error).toBeNull();
	});

	it("flattens draft, active, completed, killed into a single array", async () => {
		mockApiFetch.mockImplementation(makeMockFetch(MOCK_BETS_RESPONSE));

		const { result } = renderHook(() => useBets());

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		// 3 bets total (1 draft + 1 active + 1 completed + 0 killed)
		expect(result.current.bets).toHaveLength(3);
		expect(result.current.bets.map((b) => b.id)).toContain("bet-draft-1");
		expect(result.current.bets.map((b) => b.id)).toContain("bet-active-1");
		expect(result.current.bets.map((b) => b.id)).toContain("bet-completed-1");
	});

	it("returns error on failed fetch", async () => {
		mockApiFetch.mockImplementation(makeMockFetch({}, false));

		const { result } = renderHook(() => useBets());

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.error).not.toBeNull();
		expect(result.current.bets).toEqual([]);
	});

	it("exposes a refresh function that re-fetches", async () => {
		mockApiFetch.mockImplementation(makeMockFetch(MOCK_BETS_RESPONSE));

		const { result } = renderHook(() => useBets());

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		const initialCallCount = mockApiFetch.mock.calls.length;

		// Trigger refresh
		result.current.refresh();

		await waitFor(() => {
			expect(mockApiFetch.mock.calls.length).toBeGreaterThan(initialCallCount);
		});
	});

	it("fetches from /api/bets endpoint", async () => {
		mockApiFetch.mockImplementation(makeMockFetch(MOCK_BETS_RESPONSE));

		renderHook(() => useBets());

		await waitFor(() => {
			expect(mockApiFetch).toHaveBeenCalled();
		});

		const calledUrl = mockApiFetch.mock.calls[0]?.[0];
		expect(calledUrl).toBe("/api/bets");
	});

	it("each bet has id, title, teamId, status, description fields", async () => {
		mockApiFetch.mockImplementation(makeMockFetch(MOCK_BETS_RESPONSE));

		const { result } = renderHook(() => useBets());

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		const draftBet = result.current.bets.find((b) => b.id === "bet-draft-1");
		expect(draftBet).toBeDefined();
		expect(draftBet?.title).toBe("Draft Bet");
		expect(draftBet?.teamId).toBe("team-1");
		expect(draftBet?.status).toBe("draft");
		expect(draftBet?.description).toBe("A draft bet");
	});
});
