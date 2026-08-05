/**
 * L13 — useTeams hook unit tests.
 *
 * @lore U5: Renamed from useProducts.test.ts → useTeams.test.ts.
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

// Mock apiFetch so tests are not sensitive to fetch() call argument count.
// Header injection is covered by api-fetch.test.ts; these tests focus on
// hook logic (loading state, data, error, cancellation).
vi.mock("../../services/api-fetch.js", () => ({
	apiFetch: vi.fn(),
}));

import { useTeams } from "../useTeams";

const MOCK_TEAMS_RESPONSE = {
	teams: [
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

describe("useTeams", () => {
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
		const { result } = renderHook(() => useTeams());
		expect(result.current.loading).toBe(true);
		expect(result.current.data).toBeNull();
		expect(result.current.error).toBeNull();
	});

	it("populates data on successful fetch", async () => {
		fetchSpy.mockResolvedValueOnce(
			new Response(JSON.stringify(MOCK_TEAMS_RESPONSE), { status: 200 }),
		);
		const { result } = renderHook(() => useTeams());

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.data).toMatchObject({ teams: [{ id: "p1" }] });
		expect(result.current.error).toBeNull();
	});

	it("populates error on non-ok response", async () => {
		fetchSpy.mockResolvedValueOnce(new Response("Server Error", { status: 500 }));
		const { result } = renderHook(() => useTeams());

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.data).toBeNull();
		expect(result.current.error).toBeInstanceOf(Error);
		expect(result.current.error?.message).toMatch(/500/);
	});

	it("populates error on network failure", async () => {
		fetchSpy.mockRejectedValueOnce(new Error("Network error"));
		const { result } = renderHook(() => useTeams());

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.data).toBeNull();
		expect(result.current.error).toBeInstanceOf(Error);
	});

	it("calls apiFetch with the correct URL", async () => {
		fetchSpy.mockResolvedValueOnce(
			new Response(JSON.stringify(MOCK_TEAMS_RESPONSE), { status: 200 }),
		);
		renderHook(() => useTeams());

		await waitFor(() => {
			// @lore U11: Migrated from /api/products to /api/teams (server route renamed in U2).
			expect(fetchSpy).toHaveBeenCalledWith("/api/teams");
		});
	});

	it("does not set state after unmount", async () => {
		let resolve!: (r: Response) => void;
		const pending = new Promise<Response>((res) => {
			resolve = res;
		});
		fetchSpy.mockReturnValueOnce(pending);

		const { unmount } = renderHook(() => useTeams());
		unmount();
		resolve(new Response(JSON.stringify(MOCK_TEAMS_RESPONSE), { status: 200 }));
		// No assertion — verifying no throw on unmounted state update
	});
});
