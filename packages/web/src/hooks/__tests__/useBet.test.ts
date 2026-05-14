/**
 * L16 — useBet hook unit tests.
 *
 * Covers:
 *   - Initial loading state when betId is defined.
 *   - Successful fetch → data populated, loading false, error null.
 *   - Failed fetch → error populated, data null, loading false.
 *   - undefined betId → no fetch, loading false, data null.
 *   - betId change → cancels stale request, issues new one.
 *
 * @lore api-typesafety S4: The tests now mock the typed hono/client
 * (apiClient.bets[":id"].$get) instead of the raw apiFetch function.
 * This keeps the tests focused on hook logic (loading state, data, error,
 * cancellation) without coupling to the HTTP transport layer. The hono
 * client's fetch option is tested separately in the api-fetch tests.
 */

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BetDetail } from "../../types/bet";

// Mock the typed API client. We target the specific method used by useBet:
// apiClient.bets[":id"].$get(). By mocking the module at the client level
// we avoid any coupling to HTTP transport details.
vi.mock("../../api/client.js", () => ({
	apiClient: {
		bets: {
			":id": {
				$get: vi.fn(),
			},
		},
	},
}));

import { useBet } from "../useBet";

const MOCK_BET: BetDetail = {
	id: "b1",
	title: "Auth flow",
	product: "Alpha",
	team: "Alpha Core",
	status: "committed",
	progress: { done: 1, total: 3 },
	pitch: "# Problem\n\nAuth is broken.\n",
	costAppetite: null,
	tokenAppetite: null,
	costActual: null,
	tokensActual: null,
	tasks: [],
};

describe("useBet", () => {
	let getBetSpy: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		const { apiClient } = await import("../../api/client.js");
		getBetSpy = vi.mocked(
			(apiClient as { bets: { ":id": { $get: ReturnType<typeof vi.fn> } } }).bets[":id"].$get,
		);
		getBetSpy.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("starts in loading state when betId is defined", () => {
		getBetSpy.mockImplementation(() => new Promise(() => {})); // never resolves
		const { result } = renderHook(() => useBet("b1"));
		expect(result.current.loading).toBe(true);
		expect(result.current.data).toBeNull();
		expect(result.current.error).toBeNull();
	});

	it("returns data=null, loading=false when betId is undefined", async () => {
		const { result } = renderHook(() => useBet(undefined));
		expect(result.current.loading).toBe(false);
		expect(result.current.data).toBeNull();
		expect(result.current.error).toBeNull();
	});

	it("populates data on successful fetch", async () => {
		getBetSpy.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve(MOCK_BET),
		});
		const { result } = renderHook(() => useBet("b1"));

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.data).toMatchObject({ id: "b1", title: "Auth flow" });
		expect(result.current.error).toBeNull();
	});

	it("populates error on non-ok response", async () => {
		getBetSpy.mockResolvedValueOnce({ ok: false, status: 404 });
		const { result } = renderHook(() => useBet("missing"));

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.data).toBeNull();
		expect(result.current.error).toBeInstanceOf(Error);
		expect(result.current.error?.message).toMatch(/404/);
	});

	it("populates error on network failure", async () => {
		getBetSpy.mockRejectedValueOnce(new Error("Network error"));
		const { result } = renderHook(() => useBet("b1"));

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.data).toBeNull();
		expect(result.current.error).toBeInstanceOf(Error);
		expect(result.current.error?.message).toBe("Network error");
	});

	it("calls the typed client with the correct bet id", async () => {
		getBetSpy.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve(MOCK_BET),
		});
		renderHook(() => useBet("b1"));

		await waitFor(() => {
			expect(getBetSpy).toHaveBeenCalledWith({ param: { id: "b1" } });
		});
	});

	it("cancels stale response when betId changes", async () => {
		let firstResolve!: (r: { ok: boolean; json: () => Promise<BetDetail> }) => void;
		const firstFetch = new Promise<{ ok: boolean; json: () => Promise<BetDetail> }>((res) => {
			firstResolve = res;
		});

		getBetSpy.mockReturnValueOnce(firstFetch).mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve({ ...MOCK_BET, id: "b2" }),
		});

		const { result, rerender } = renderHook(({ id }) => useBet(id), {
			initialProps: { id: "b1" as string | undefined },
		});

		// Change betId before first fetch resolves.
		rerender({ id: "b2" });

		// Wait for second fetch to resolve.
		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		// Now resolve the first (stale) fetch — data should remain b2.
		firstResolve({ ok: true, json: () => Promise.resolve(MOCK_BET) });

		// State should reflect b2, not b1.
		expect(result.current.data?.id).toBe("b2");
	});
});
