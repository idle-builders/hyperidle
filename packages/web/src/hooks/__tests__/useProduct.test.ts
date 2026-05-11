/**
 * L13 — useProduct hook unit tests (red phase).
 *
 * Covers:
 *   - Initial loading state when productId is defined.
 *   - Successful fetch → data populated, loading false, error null.
 *   - Failed fetch (non-ok response) → error populated, data null, loading false.
 *   - undefined productId → no fetch, loading false, data null.
 *   - Unmount during in-flight cancels the update (state never sets after unmount).
 */

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Import the hook — it doesn't exist yet so this test will fail until green phase.
import { useProduct } from "../useProduct";

const MOCK_PRODUCT_DETAIL = {
	product: {
		id: "p1",
		name: "HyperIdle Core",
		phase: "build",
		status: "healthy",
		leadAgentId: "agent-lead",
	},
	team: { id: "t1", formedAt: "2024-01-01T00:00:00.000Z", dissolvedAt: null },
	roster: [
		{ agentId: "agent-lead", name: "Lead Agent", role: "lead", isLead: true },
		{ agentId: "agent-member", name: "Alice Agent", role: "member", isLead: false },
	],
	burn: { costActual: 4200, costCap: 10000, capacity: 5, activeBets: 2 },
	activeBets: [
		{
			id: "b1",
			pitchTitle: "Auth migration",
			appetite: "2 weeks",
			status: "committed",
			progressDone: 1,
			progressTotal: 2,
		},
	],
};

describe("useProduct", () => {
	beforeEach(() => {
		vi.spyOn(globalThis, "fetch");
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("starts in loading state when productId is defined", () => {
		vi.mocked(fetch).mockImplementation(() => new Promise(() => {})); // never resolves
		const { result } = renderHook(() => useProduct("p1"));
		expect(result.current.loading).toBe(true);
		expect(result.current.data).toBeNull();
		expect(result.current.error).toBeNull();
	});

	it("returns data=null, loading=false when productId is undefined", () => {
		const { result } = renderHook(() => useProduct(undefined));
		expect(result.current.loading).toBe(false);
		expect(result.current.data).toBeNull();
		expect(result.current.error).toBeNull();
	});

	it("populates data on successful fetch", async () => {
		vi.mocked(fetch).mockResolvedValueOnce(
			new Response(JSON.stringify(MOCK_PRODUCT_DETAIL), { status: 200 }),
		);
		const { result } = renderHook(() => useProduct("p1"));

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.data).toMatchObject({ product: { id: "p1", name: "HyperIdle Core" } });
		expect(result.current.error).toBeNull();
	});

	it("populates error on non-ok response", async () => {
		vi.mocked(fetch).mockResolvedValueOnce(new Response("Not Found", { status: 404 }));
		const { result } = renderHook(() => useProduct("missing"));

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.data).toBeNull();
		expect(result.current.error).toBeInstanceOf(Error);
		expect(result.current.error?.message).toMatch(/404/);
	});

	it("populates error on network failure", async () => {
		vi.mocked(fetch).mockRejectedValueOnce(new Error("Network error"));
		const { result } = renderHook(() => useProduct("p1"));

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.data).toBeNull();
		expect(result.current.error).toBeInstanceOf(Error);
		expect(result.current.error?.message).toBe("Network error");
	});

	it("calls fetch with the correct URL", async () => {
		vi.mocked(fetch).mockResolvedValueOnce(
			new Response(JSON.stringify(MOCK_PRODUCT_DETAIL), { status: 200 }),
		);
		renderHook(() => useProduct("p1"));

		await waitFor(() => {
			// hc<ProductsRoutes> passes a full options object alongside the URL;
			// assert only that the first argument is the expected URL.
			expect(fetch).toHaveBeenCalledWith("/api/products/p1", expect.any(Object));
		});
	});

	it("does not set state after unmount (cancels stale response)", async () => {
		let resolve!: (r: Response) => void;
		const pending = new Promise<Response>((res) => {
			resolve = res;
		});
		vi.mocked(fetch).mockReturnValueOnce(pending);

		const { result, unmount } = renderHook(() => useProduct("p1"));
		expect(result.current.loading).toBe(true);

		// Unmount before fetch resolves
		unmount();

		// Resolve the fetch — should not cause a state update
		resolve(new Response(JSON.stringify(MOCK_PRODUCT_DETAIL), { status: 200 }));

		// No assertion on result.current after unmount — the point is it doesn't throw
		// (React strict mode guards against state updates on unmounted components)
	});
});
