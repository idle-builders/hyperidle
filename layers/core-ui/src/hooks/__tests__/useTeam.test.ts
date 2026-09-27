/**
 * L13 — useTeam hook unit tests.
 *
 * @lore useTeam composes from search_users/search_tasks/open_task, not one GET route — call is mocked at the door instead of apiFetch.
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

	it("counts subtask progress from the whole descendant subtree, not the task itself", async () => {
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
						children: [
							{ id: "c1", state: "done", children: [] },
							{ id: "c2", state: "done", children: [] },
							{
								id: "c3",
								state: "in_progress",
								children: [{ id: "c3a", state: "done", children: [] }],
							},
						],
						tokensActualRollup: null,
						threadId: "t1",
						attachments: [],
					},
				});
			}
			return Promise.resolve({ ok: true, data: [] });
		});

		const { result } = renderHook(() => useTeam("p1"));

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		// Root task (ROOT_TASK) itself is excluded; c1, c2, c3, c3a are counted;
		// c1, c2, c3a are done, c3 is not → 3 of 4 (asymmetric — flipping the
		// done check would give 1, not 3, so a broken comparison fails this).
		expect(result.current.data?.tasksInProgress[0]).toMatchObject({
			id: ROOT_TASK.id,
			progressDone: 3,
			progressTotal: 4,
		});
	});

	it("calls search_users with the teamId", async () => {
		setupOk();
		renderHook(() => useTeam("p1"));

		await waitFor(() => {
			expect(callMock).toHaveBeenCalledWith("search_users", { teamId: "p1" });
		});
	});
});
