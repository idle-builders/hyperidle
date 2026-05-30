/**
 * Q3 — useCanvasBets hook tests.
 *
 * Covers:
 *   T1: fetch GET /api/bets/canvas, return shaped/committed arrays and capacity
 *
 * AC covered: AC1 (hook provides data for Canvas)
 */

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CanvasBet } from "../../shell/Canvas";

vi.mock("../../services/api-fetch.js", () => ({
	apiFetch: vi.fn(),
}));

import { useCanvasBets } from "../useCanvasBets";

// @lore U1: "shaped" → "draft", "committed" → "active"
const MOCK_DRAFT_BET: CanvasBet = {
	id: "bet-1",
	title: "Feature Alpha",
	team: "Test Team",
	teamId: "team-1",
	status: "draft",
	appetite: "—",
};

const MOCK_ACTIVE_BET: CanvasBet = {
	id: "bet-2",
	title: "Feature Beta",
	team: "Test Team",
	teamId: "team-1",
	status: "active",
	appetite: "$100.00",
};

const MOCK_CANVAS_RESPONSE = {
	draft: [MOCK_DRAFT_BET],
	active: [MOCK_ACTIVE_BET],
	capacity: { used: 1, max: 2 },
};

describe("useCanvasBets", () => {
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		const { apiFetch } = await import("../../services/api-fetch.js");
		fetchSpy = vi.mocked(apiFetch);
		fetchSpy.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("starts in loading state", () => {
		fetchSpy.mockImplementation(() => new Promise(() => {})); // never resolves
		const { result } = renderHook(() => useCanvasBets());
		expect(result.current.loading).toBe(true);
		expect(result.current.bets).toEqual([]);
		expect(result.current.capacity).toEqual({ used: 0, max: 0 });
		expect(result.current.error).toBeNull();
	});

	it("fetches from /api/bets/canvas", async () => {
		fetchSpy.mockResolvedValueOnce(
			new Response(JSON.stringify(MOCK_CANVAS_RESPONSE), { status: 200 }),
		);
		renderHook(() => useCanvasBets());

		await waitFor(() => {
			expect(fetchSpy).toHaveBeenCalledWith("/api/bets/canvas");
		});
	});

	it("returns draft and active bets merged into a flat bets array", async () => {
		fetchSpy.mockResolvedValueOnce(
			new Response(JSON.stringify(MOCK_CANVAS_RESPONSE), { status: 200 }),
		);
		const { result } = renderHook(() => useCanvasBets());

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.bets).toHaveLength(2);
		expect(result.current.bets.some((b) => b.id === "bet-1")).toBe(true);
		expect(result.current.bets.some((b) => b.id === "bet-2")).toBe(true);
	});

	it("returns capacity from API response", async () => {
		fetchSpy.mockResolvedValueOnce(
			new Response(JSON.stringify(MOCK_CANVAS_RESPONSE), { status: 200 }),
		);
		const { result } = renderHook(() => useCanvasBets());

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.capacity).toEqual({ used: 1, max: 2 });
	});

	it("sets error on non-ok response", async () => {
		fetchSpy.mockResolvedValueOnce(new Response("Not Found", { status: 404 }));
		const { result } = renderHook(() => useCanvasBets());

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.error).toBeInstanceOf(Error);
		expect(result.current.bets).toEqual([]);
	});

	it("sets error on network failure", async () => {
		fetchSpy.mockRejectedValueOnce(new Error("Network error"));
		const { result } = renderHook(() => useCanvasBets());

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.error).toBeInstanceOf(Error);
		expect(result.current.error?.message).toBe("Network error");
	});

	it("exposes a refresh() function that triggers a refetch", async () => {
		fetchSpy
			.mockResolvedValueOnce(new Response(JSON.stringify(MOCK_CANVAS_RESPONSE), { status: 200 }))
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						...MOCK_CANVAS_RESPONSE,
						draft: [{ ...MOCK_DRAFT_BET, id: "bet-3" }],
					}),
					{ status: 200 },
				),
			);

		const { result } = renderHook(() => useCanvasBets());

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		// Trigger refresh
		result.current.refresh();

		await waitFor(() => {
			expect(fetchSpy).toHaveBeenCalledTimes(2);
		});
	});
});
