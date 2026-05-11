/**
 * L13 — useProducts hook unit tests (red phase).
 *
 * Covers:
 *   - Initial loading state.
 *   - Successful fetch → data populated, loading false, error null.
 *   - Failed fetch (non-ok response) → error populated, data null, loading false.
 *   - Correct URL called.
 *   - Unmount during in-flight cancels the update.
 */

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Import the hook — it doesn't exist yet so this test will fail until green phase.
import { useProducts } from "../useProducts";

const MOCK_PRODUCTS_RESPONSE = {
	products: [
		{
			id: "p1",
			name: "HyperIdle Core",
			phase: "build",
			status: "healthy",
			leadAgentId: "agent-lead",
			activeBets: 2,
			shipped: 4,
			shipRate: "67%",
			progress: { done: 1, total: 3 },
		},
	],
};

describe("useProducts", () => {
	beforeEach(() => {
		vi.spyOn(globalThis, "fetch");
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("starts in loading state", () => {
		vi.mocked(fetch).mockImplementation(() => new Promise(() => {})); // never resolves
		const { result } = renderHook(() => useProducts());
		expect(result.current.loading).toBe(true);
		expect(result.current.data).toBeNull();
		expect(result.current.error).toBeNull();
	});

	it("populates data on successful fetch", async () => {
		vi.mocked(fetch).mockResolvedValueOnce(
			new Response(JSON.stringify(MOCK_PRODUCTS_RESPONSE), { status: 200 }),
		);
		const { result } = renderHook(() => useProducts());

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.data).toMatchObject({ products: [{ id: "p1" }] });
		expect(result.current.error).toBeNull();
	});

	it("populates error on non-ok response", async () => {
		vi.mocked(fetch).mockResolvedValueOnce(new Response("Server Error", { status: 500 }));
		const { result } = renderHook(() => useProducts());

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.data).toBeNull();
		expect(result.current.error).toBeInstanceOf(Error);
		expect(result.current.error?.message).toMatch(/500/);
	});

	it("populates error on network failure", async () => {
		vi.mocked(fetch).mockRejectedValueOnce(new Error("Network error"));
		const { result } = renderHook(() => useProducts());

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.data).toBeNull();
		expect(result.current.error).toBeInstanceOf(Error);
	});

	it("calls fetch with the correct URL", async () => {
		vi.mocked(fetch).mockResolvedValueOnce(
			new Response(JSON.stringify(MOCK_PRODUCTS_RESPONSE), { status: 200 }),
		);
		renderHook(() => useProducts());

		await waitFor(() => {
			expect(fetch).toHaveBeenCalledWith("/api/products");
		});
	});

	it("does not set state after unmount", async () => {
		let resolve!: (r: Response) => void;
		const pending = new Promise<Response>((res) => {
			resolve = res;
		});
		vi.mocked(fetch).mockReturnValueOnce(pending);

		const { unmount } = renderHook(() => useProducts());
		unmount();
		resolve(new Response(JSON.stringify(MOCK_PRODUCTS_RESPONSE), { status: 200 }));
		// No assertion — verifying no throw on unmounted state update
	});
});
