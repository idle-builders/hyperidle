/**
 * L16 — useBet hook unit tests.
 *
 * Covers:
 *   - Initial loading state when betId is defined.
 *   - Successful fetch → data populated, loading false, error null.
 *   - Failed fetch → error populated, data null, loading false.
 *   - undefined betId → no fetch, loading false, data null.
 *   - betId change → cancels stale request, issues new one.
 */

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BetDetail } from "../../types/bet";

// Mock apiFetch so tests are not sensitive to fetch() call argument count.
// Header injection is covered by api-fetch.test.ts; these tests focus on
// hook logic (loading state, data, error, cancellation).
vi.mock("../../services/api-fetch.js", () => ({
	apiFetch: vi.fn(),
}));

import { useBet } from "../useBet";

const MOCK_BET: BetDetail = {
	id: "b1",
	title: "Auth flow",
	team: "Alpha Core",
	status: "active",
	atRisk: false,
	tokenAppetite: null,
	tokensActual: null,
	progress: { done: 1, total: 3 },
	description: "# Problem\n\nAuth is broken.\n",
	tasks: [],
};

describe("useBet", () => {
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		const { apiFetch } = await import("../../services/api-fetch.js");
		fetchSpy = vi.mocked(apiFetch);
		fetchSpy.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("starts in loading state when betId is defined", () => {
		fetchSpy.mockImplementation(() => new Promise(() => {})); // never resolves
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
		fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(MOCK_BET), { status: 200 }));
		const { result } = renderHook(() => useBet("b1"));

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.data).toMatchObject({ id: "b1", title: "Auth flow" });
		expect(result.current.error).toBeNull();
	});

	it("populates error on non-ok response", async () => {
		fetchSpy.mockResolvedValueOnce(new Response("Not Found", { status: 404 }));
		const { result } = renderHook(() => useBet("missing"));

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.data).toBeNull();
		expect(result.current.error).toBeInstanceOf(Error);
		expect(result.current.error?.message).toMatch(/404/);
	});

	it("populates error on network failure", async () => {
		fetchSpy.mockRejectedValueOnce(new Error("Network error"));
		const { result } = renderHook(() => useBet("b1"));

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.data).toBeNull();
		expect(result.current.error).toBeInstanceOf(Error);
		expect(result.current.error?.message).toBe("Network error");
	});

	it("calls apiFetch with the correct URL", async () => {
		fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(MOCK_BET), { status: 200 }));
		renderHook(() => useBet("b1"));

		await waitFor(() => {
			expect(fetchSpy).toHaveBeenCalledWith("/api/bets/b1");
		});
	});

	it("cancels stale response when betId changes", async () => {
		let firstResolve!: (r: Response) => void;
		const firstFetch = new Promise<Response>((res) => {
			firstResolve = res;
		});

		fetchSpy
			.mockReturnValueOnce(firstFetch)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ ...MOCK_BET, id: "b2" }), { status: 200 }),
			);

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
		firstResolve(new Response(JSON.stringify(MOCK_BET), { status: 200 }));

		// State should reflect b2, not b1.
		expect(result.current.data?.id).toBe("b2");
	});
});
