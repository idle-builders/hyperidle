/**
 * L13 — useTeams hook unit tests.
 *
 * @lore BC5 T11: `GET /api/teams` is deleted with the `teams` route family —
 * the hook rebuilds the team list from `search_users({})` (teams = the
 * distinct `team` every row carries) and, per team, `search_tasks` for the
 * blocked/in-progress signal `useTeam.ts` (singular) already computes for
 * one team's page. These tests mock `call()`, not `apiFetch`.
 *
 * Covers:
 *   - Initial loading state.
 *   - Successful fetch → data populated (distinct teams, per-team stats), loading false, error null.
 *   - Failed search_users → error populated, data null, loading false.
 *   - Unmount during in-flight cancels the update.
 */

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../services/call.js", () => ({
	call: vi.fn(),
}));

import { call } from "../../services/call.js";
import { useTeams } from "../useTeams";

const USER_A = {
	id: "u1",
	name: "Alice",
	kind: "human",
	team: { id: "p1", name: "HyperIdle Core" },
};
const USER_B = {
	id: "u2",
	name: "Bob",
	kind: "human",
	team: { id: "p1", name: "HyperIdle Core" },
};

function mockCallImplementation(
	callFn: ReturnType<typeof vi.fn>,
	options: {
		usersOk?: boolean;
		blockedCount?: number;
		inProgressCount?: number;
	} = {},
): void {
	const { usersOk = true, blockedCount = 0, inProgressCount = 2 } = options;
	callFn.mockImplementation(async (name: string, input: Record<string, unknown>) => {
		if (name === "search_users") {
			return usersOk
				? { ok: true, data: [USER_A, USER_B] }
				: { ok: false, problems: [{ code: "problem", message: "search_users failed" }] };
		}
		if (name === "search_tasks") {
			if (input.state === "blocked") {
				return {
					ok: true,
					data: Array.from({ length: blockedCount }, (_, i) => ({ id: `b${i}` })),
				};
			}
			return {
				ok: true,
				data: Array.from({ length: inProgressCount }, (_, i) => ({ id: `t${i}` })),
			};
		}
		throw new Error(`unexpected call: ${name}`);
	});
}

describe("useTeams", () => {
	let callSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		callSpy = vi.mocked(call);
		callSpy.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("starts in loading state", () => {
		callSpy.mockImplementation(() => new Promise(() => {})); // never resolves
		const { result } = renderHook(() => useTeams());
		expect(result.current.loading).toBe(true);
		expect(result.current.data).toBeNull();
		expect(result.current.error).toBeNull();
	});

	it("populates data with one distinct team and its stats on successful fetch", async () => {
		mockCallImplementation(callSpy, { blockedCount: 0, inProgressCount: 2 });
		const { result } = renderHook(() => useTeams());

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.data).toEqual({
			teams: [{ id: "p1", name: "HyperIdle Core", status: "healthy", tasksInProgress: 2 }],
		});
		expect(result.current.error).toBeNull();
	});

	it("marks a team blocked when it has a blocked task", async () => {
		mockCallImplementation(callSpy, { blockedCount: 1, inProgressCount: 0 });
		const { result } = renderHook(() => useTeams());

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.data?.teams[0]?.status).toBe("blocked");
	});

	it("populates error when search_users fails", async () => {
		mockCallImplementation(callSpy, { usersOk: false });
		const { result } = renderHook(() => useTeams());

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.data).toBeNull();
		expect(result.current.error).toBeInstanceOf(Error);
	});

	it("populates error on network failure", async () => {
		callSpy.mockRejectedValueOnce(new Error("Network error"));
		const { result } = renderHook(() => useTeams());

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.data).toBeNull();
		expect(result.current.error).toBeInstanceOf(Error);
	});

	it("calls search_users with an empty query", async () => {
		mockCallImplementation(callSpy);
		renderHook(() => useTeams());

		await waitFor(() => {
			expect(callSpy).toHaveBeenCalledWith("search_users", {});
		});
	});

	it("does not set state after unmount", async () => {
		let resolveUsers!: (r: unknown) => void;
		const pending = new Promise((res) => {
			resolveUsers = res;
		});
		callSpy.mockImplementation(async (name: string) => {
			if (name === "search_users") return pending;
			throw new Error(`unexpected call: ${name}`);
		});
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		const { unmount } = renderHook(() => useTeams());
		unmount();
		resolveUsers({ ok: true, data: [USER_A] });
		await Promise.resolve();

		// React logs an error if a state update fires after unmount — the hook's
		// cancellation guard must prevent that.
		expect(errorSpy).not.toHaveBeenCalled();
	});
});
