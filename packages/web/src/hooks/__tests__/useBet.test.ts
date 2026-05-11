/**
 * L16 — useBet hook unit tests (red phase).
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

// Import the hook — it doesn't exist yet so this test will fail until green phase.
import { useBet } from "../useBet";

const MOCK_BET: BetDetail = {
	id: "b1",
	title: "Auth flow",
	product: "Alpha",
	team: "Alpha Core",
	status: "committed",
	appetite: "2 weeks",
	progress: { done: 1, total: 3 },
	pitch: "# Problem\n\nAuth is broken.\n",
	tasks: [],
	comments: [],
};

describe("useBet", () => {
	beforeEach(() => {
		vi.spyOn(globalThis, "fetch");
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("starts in loading state when betId is defined", () => {
		vi.mocked(fetch).mockImplementation(() => new Promise(() => {})); // never resolves
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
		vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(MOCK_BET), { status: 200 }));
		const { result } = renderHook(() => useBet("b1"));

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.data).toMatchObject({ id: "b1", title: "Auth flow" });
		expect(result.current.error).toBeNull();
	});

	it("populates error on non-ok response", async () => {
		vi.mocked(fetch).mockResolvedValueOnce(new Response("Not Found", { status: 404 }));
		const { result } = renderHook(() => useBet("missing"));

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.data).toBeNull();
		expect(result.current.error).toBeInstanceOf(Error);
		expect(result.current.error?.message).toMatch(/404/);
	});

	it("populates error on network failure", async () => {
		vi.mocked(fetch).mockRejectedValueOnce(new Error("Network error"));
		const { result } = renderHook(() => useBet("b1"));

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.data).toBeNull();
		expect(result.current.error).toBeInstanceOf(Error);
		expect(result.current.error?.message).toBe("Network error");
	});

	it("calls fetch with the correct URL", async () => {
		vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(MOCK_BET), { status: 200 }));
		renderHook(() => useBet("b1"));

		await waitFor(() => {
			expect(fetch).toHaveBeenCalledWith("/api/bets/b1");
		});
	});

	it("cancels stale response when betId changes", async () => {
		let firstResolve!: (r: Response) => void;
		const firstFetch = new Promise<Response>((res) => {
			firstResolve = res;
		});

		vi.mocked(fetch)
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
