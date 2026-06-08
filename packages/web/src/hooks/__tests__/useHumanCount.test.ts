/**
 * AD3 — useHumanCount hook unit tests.
 *
 * AC-5 (reactivity via hook): hook filters users by kind === "human" and
 * returns { humanCount, loading }.
 *
 * Covers:
 *   - Initial loading state (humanCount null, loading true)
 *   - Successful fetch with multiple human users
 *   - Successful fetch filtering out non-human (agent) users
 *   - Solo user (exactly 1 human)
 *   - Zero humans (no human users)
 *   - Error state — fail-open: humanCount null (not 0), so callers default to
 *     showing full UI rather than hiding it incorrectly.
 */

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../services/api-fetch.js", () => ({
	apiFetch: vi.fn(),
}));

import { useHumanCount } from "../useHumanCount";

type OrgUser = { id: string; kind: string; name: string; role: string };

function makeOrgResponse(users: OrgUser[]): string {
	return JSON.stringify({ edges: [], users });
}

describe("useHumanCount", () => {
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		const { apiFetch } = await import("../../services/api-fetch.js");
		fetchSpy = vi.mocked(apiFetch);
		fetchSpy.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("starts in loading state (humanCount null, loading true)", () => {
		fetchSpy.mockImplementation(() => new Promise(() => {})); // never resolves
		const { result } = renderHook(() => useHumanCount());
		expect(result.current.loading).toBe(true);
		expect(result.current.humanCount).toBeNull();
	});

	it("returns humanCount = 2 when org has 2 human users and 1 agent", async () => {
		const users: OrgUser[] = [
			{ id: "u1", kind: "human", name: "Alice", role: "owner" },
			{ id: "u2", kind: "human", name: "Bob", role: "member" },
			{ id: "a1", kind: "agent", name: "Helper", role: "agent" },
		];
		fetchSpy.mockResolvedValueOnce(
			new Response(makeOrgResponse(users), { status: 200 }),
		);
		const { result } = renderHook(() => useHumanCount());

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.humanCount).toBe(2);
	});

	it("returns humanCount = 1 when org has exactly 1 human (solo mode)", async () => {
		const users: OrgUser[] = [
			{ id: "u1", kind: "human", name: "Solo Founder", role: "owner" },
		];
		fetchSpy.mockResolvedValueOnce(
			new Response(makeOrgResponse(users), { status: 200 }),
		);
		const { result } = renderHook(() => useHumanCount());

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.humanCount).toBe(1);
	});

	it("returns humanCount = 0 when all users are agents", async () => {
		const users: OrgUser[] = [
			{ id: "a1", kind: "agent", name: "Bot", role: "agent" },
		];
		fetchSpy.mockResolvedValueOnce(
			new Response(makeOrgResponse(users), { status: 200 }),
		);
		const { result } = renderHook(() => useHumanCount());

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.humanCount).toBe(0);
	});

	it("fail-open: returns humanCount = null on error (not 0)", async () => {
		// @lore AD3: fail-open means null on error, not 0. Callers treat null as
		// "unknown/loading" and default to showing full UI rather than incorrectly
		// hiding multi-user content on transient fetch errors.
		fetchSpy.mockResolvedValueOnce(new Response("Server Error", { status: 500 }));
		const { result } = renderHook(() => useHumanCount());

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.humanCount).toBeNull();
	});

	it("fail-open: returns humanCount = null on network failure", async () => {
		fetchSpy.mockRejectedValueOnce(new Error("Network error"));
		const { result } = renderHook(() => useHumanCount());

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.humanCount).toBeNull();
	});

	it("calls /api/org endpoint", async () => {
		const users: OrgUser[] = [{ id: "u1", kind: "human", name: "Alice", role: "owner" }];
		fetchSpy.mockResolvedValueOnce(
			new Response(makeOrgResponse(users), { status: 200 }),
		);
		renderHook(() => useHumanCount());

		await waitFor(() => {
			expect(fetchSpy).toHaveBeenCalledWith("/api/org");
		});
	});
});
