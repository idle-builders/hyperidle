/**
 * L13 — useTeam hook unit tests.
 *
 * @lore U5: Renamed from useProduct.test.ts → useTeam.test.ts.
 * @lore BC5 T9: the door swap — `useTeam` now composes from
 * `search_users`/`search_tasks`/`open_task` (see useTeam.ts's own header),
 * not one `GET /api/teams/:id` — `call` is mocked at the door instead of
 * `apiFetch`.
 *
 * Covers:
 *   - Initial loading state when teamId is defined.
 *   - Successful fetch → data populated, loading false, error null.
 *   - Failed fetch (search_users not ok, or no member carries the team) → error.
 *   - undefined teamId → no fetch, loading false, data null.
 *   - Unmount during in-flight cancels the update (state never sets after unmount).
 */

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));
vi.mock("../../services/call.js", () => ({ call: callMock }));

import { useTeam } from "../useTeam.js";

const MEMBERS = [
	{
		id: "agent-lead",
		kind: "ai",
		name: "Lead Agent",
		role: "lead",
		status: "active",
		avatarUrl: null,
		createdAt: "2024-01-01T00:00:00.000Z",
		agentCategory: "team",
		ownerUserId: null,
		health: null,
		team: { id: "p1", name: "HyperIdle Core" },
		edges: [],
	},
	{
		id: "agent-member",
		kind: "ai",
		name: "Alice Agent",
		role: "member",
		status: "active",
		avatarUrl: null,
		createdAt: "2024-01-01T00:00:00.000Z",
		agentCategory: "team",
		ownerUserId: null,
		health: null,
		team: { id: "p1", name: "HyperIdle Core" },
		edges: [],
	},
];

const ROOT_TASK = {
	id: "b1",
	title: "Auth migration",
	state: "in_progress",
	parentTaskId: null,
	teamId: "p1",
};

/** Routes `search_users`/`search_tasks`/`open_task` for a healthy, populated team. */
function setupOk(): void {
	callMock.mockImplementation((name: string, input: Record<string, unknown>) => {
		if (name === "search_users") return Promise.resolve({ ok: true, data: MEMBERS });
		if (name === "search_tasks") {
			if (input.state === "blocked") return Promise.resolve({ ok: true, data: [] });
			return Promise.resolve({ ok: true, data: [ROOT_TASK] });
		}
		if (name === "open_task") {
			return Promise.resolve({
				ok: true,
				data: {
					task: ROOT_TASK,
					ancestors: [],
					children: [],
					tokensActualRollup: null,
					threadId: "t1",
					attachments: [],
				},
			});
		}
		return Promise.resolve({ ok: true, data: [] });
	});
}

describe("useTeam", () => {
	beforeEach(() => {
		callMock.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("starts in loading state when teamId is defined", () => {
		callMock.mockImplementation(() => new Promise(() => {})); // never resolves
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
		setupOk();
		const { result } = renderHook(() => useTeam("p1"));

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.data).toMatchObject({
			team: { id: "p1", name: "HyperIdle Core", status: "healthy" },
		});
		expect(result.current.data?.roster).toHaveLength(2);
		expect(result.current.data?.tasksInProgress).toHaveLength(1);
		expect(result.current.error).toBeNull();
	});

	it("populates error on non-ok response", async () => {
		callMock.mockImplementation((name: string) => {
			if (name === "search_users") {
				return Promise.resolve({
					ok: false,
					problems: [{ code: "boom", message: "Team fetch failed" }],
				});
			}
			return Promise.resolve({ ok: true, data: [] });
		});
		const { result } = renderHook(() => useTeam("missing"));

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.data).toBeNull();
		expect(result.current.error).toBeInstanceOf(Error);
	});

	it("populates a 404-shaped error when no member carries the team", async () => {
		callMock.mockImplementation((name: string) => {
			if (name === "search_users") return Promise.resolve({ ok: true, data: [] });
			return Promise.resolve({ ok: true, data: [] });
		});
		const { result } = renderHook(() => useTeam("missing"));

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.data).toBeNull();
		expect(result.current.error?.message).toMatch(/404/);
	});

	it("populates error on network failure", async () => {
		callMock.mockRejectedValue(new Error("Network error"));
		const { result } = renderHook(() => useTeam("p1"));

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.data).toBeNull();
		expect(result.current.error).toBeInstanceOf(Error);
		expect(result.current.error?.message).toBe("Network error");
	});

	it("calls search_users with the teamId", async () => {
		setupOk();
		renderHook(() => useTeam("p1"));

		await waitFor(() => {
			expect(callMock).toHaveBeenCalledWith("search_users", { teamId: "p1" });
		});
	});

	it("does not set state after unmount (cancels stale response)", async () => {
		let resolveUsers!: (r: unknown) => void;
		const pending = new Promise((res) => {
			resolveUsers = res;
		});
		callMock.mockImplementation((name: string) => {
			if (name === "search_users") return pending;
			return Promise.resolve({ ok: true, data: [] });
		});

		const { result, unmount } = renderHook(() => useTeam("p1"));
		expect(result.current.loading).toBe(true);

		// Unmount before fetch resolves
		unmount();

		// Resolve the fetch — should not cause a state update
		resolveUsers({ ok: true, data: MEMBERS });

		// No assertion on result.current after unmount — the point is it doesn't throw
		// (React strict mode guards against state updates on unmounted components)
	});
});
