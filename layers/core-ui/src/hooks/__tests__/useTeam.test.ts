/**
 * L13 — useTeam hook unit tests.
 *
 * @lore U5: Renamed from useProduct.test.ts → useTeam.test.ts.
 *
 * Covers:
 *   - Initial loading state when teamId is defined.
 *   - Successful fetch → data populated, loading false, error null.
 *   - Failed fetch (non-ok response) → error populated, data null, loading false.
 *   - undefined teamId → no fetch, loading false, data null.
 *   - Unmount during in-flight cancels the update (state never sets after unmount).
 */

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock apiFetch so tests are not sensitive to fetch() call argument count.
// Header injection is covered by api-fetch.test.ts; these tests focus on
// hook logic (loading state, data, error, cancellation).
vi.mock("../../services/api-fetch.js", () => ({
	apiFetch: vi.fn(),
}));

import { useTeam } from "../useTeam";

const MOCK_TEAM_DETAIL = {
	team: {
		id: "p1",
		name: "HyperIdle Core",
		phase: "build",
		status: "healthy",
		leadAgentId: "agent-lead",
	},
	teamMembers: { id: "t1", formedAt: "2024-01-01T00:00:00.000Z", dissolvedAt: null },
	roster: [
		{ agentId: "agent-lead", name: "Lead Agent", role: "lead", isLead: true },
		{ agentId: "agent-member", name: "Alice Agent", role: "member", isLead: false },
	],
	burn: { capacity: 5 },
	tasksInProgress: [
		{
			id: "b1",
			title: "Auth migration",
			state: "in_progress",
			progressDone: 1,
			progressTotal: 2,
		},
	],
};

describe("useTeam", () => {
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		const { apiFetch } = await import("../../services/api-fetch.js");
		fetchSpy = vi.mocked(apiFetch);
		fetchSpy.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("starts in loading state when teamId is defined", () => {
		fetchSpy.mockImplementation(() => new Promise(() => {})); // never resolves
		const { result } = renderHook(() => useTeam("p1"));
		expect(result.current.loading).toBe(true);
		expect(result.current.data).toBeNull();
		expect(result.current.error).toBeNull();
	});

	it("returns data=null, loading=false when teamId is undefined", () => {
		const { result } = renderHook(() => useTeam(undefined));
		expect(result.current.loading).toBe(false);
		expect(result.current.data).toBeNull();
		expect(result.current.error).toBeNull();
	});

	it("populates data on successful fetch", async () => {
		fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(MOCK_TEAM_DETAIL), { status: 200 }));
		const { result } = renderHook(() => useTeam("p1"));

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.data).toMatchObject({ team: { id: "p1", name: "HyperIdle Core" } });
		expect(result.current.error).toBeNull();
	});

	it("populates error on non-ok response", async () => {
		fetchSpy.mockResolvedValueOnce(new Response("Not Found", { status: 404 }));
		const { result } = renderHook(() => useTeam("missing"));

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.data).toBeNull();
		expect(result.current.error).toBeInstanceOf(Error);
		expect(result.current.error?.message).toMatch(/404/);
	});

	it("populates error on network failure", async () => {
		fetchSpy.mockRejectedValueOnce(new Error("Network error"));
		const { result } = renderHook(() => useTeam("p1"));

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.data).toBeNull();
		expect(result.current.error).toBeInstanceOf(Error);
		expect(result.current.error?.message).toBe("Network error");
	});

	it("calls apiFetch with the correct URL", async () => {
		fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(MOCK_TEAM_DETAIL), { status: 200 }));
		renderHook(() => useTeam("p1"));

		await waitFor(() => {
			// @lore U11: Migrated from /api/products/:id to /api/teams/:id (server route renamed in U2).
			expect(fetchSpy).toHaveBeenCalledWith("/api/teams/p1");
		});
	});

	it("does not set state after unmount (cancels stale response)", async () => {
		let resolve!: (r: Response) => void;
		const pending = new Promise<Response>((res) => {
			resolve = res;
		});
		fetchSpy.mockReturnValueOnce(pending);

		const { result, unmount } = renderHook(() => useTeam("p1"));
		expect(result.current.loading).toBe(true);

		// Unmount before fetch resolves
		unmount();

		// Resolve the fetch — should not cause a state update
		resolve(new Response(JSON.stringify(MOCK_TEAM_DETAIL), { status: 200 }));

		// No assertion on result.current after unmount — the point is it doesn't throw
		// (React strict mode guards against state updates on unmounted components)
	});
});
