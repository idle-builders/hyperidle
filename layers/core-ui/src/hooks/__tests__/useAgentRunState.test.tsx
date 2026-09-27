/**
 * Run-state hooks tests.
 *
 * @lore both hooks call search_sessions({ agentIds }) — the same POST /api/actions/search_sessions door a person's client and an agent's MCP tool use.
 *
 * Three properties, none of which the move shipped with:
 *   - **Fail-closed.** A failed orchestration read must NOT render a
 *     crashed agent as healthy and idle. The hook reports `status: "error"`
 *     and the screens surface it; before this it silently swallowed the
 *     failure and returned the same empty state an agent with no runs has.
 *   - **One request per screen.** Task titles are fetched in ONE batched
 *     `search_tasks` call (its `ids` filter), not one call per task.
 *   - **The orchestration is tested at all.** Active-run selection,
 *     group-by-agent, the task-ref resolution and the 10-item slice
 *     were untested — every consumer mocked the hook out.
 */

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAgentRunState, useRosterRunState } from "../useAgentRunState.js";

const NOW = Date.now();
const iso = (msAgo: number): string => new Date(NOW - msAgo).toISOString();

interface SessionRowStub {
	id: string;
	agentId: string;
	taskId: string | null;
	startedAt: string;
	endedAt: string | null;
	state: string | null;
	outcome: string | null;
	effectivenessScore: string | null;
}

function row(overrides: Partial<SessionRowStub> & { id: string; agentId: string }): SessionRowStub {
	return {
		taskId: null,
		startedAt: iso(60_000),
		endedAt: iso(30_000),
		state: "done",
		outcome: "completed",
		effectivenessScore: null,
		...overrides,
	};
}

interface TaskRow {
	id: string;
	title: string;
	betId: string | null;
}

/** Route the two calls the hooks make; count them so an N+1 is visible. */
function stubFetch(
	rows: SessionRowStub[],
	tasks: TaskRow[],
): { taskCalls: string[]; sessionCalls: string[] } {
	const taskCalls: string[] = [];
	const sessionCalls: string[] = [];
	const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
		if (url === "/api/actions/search_sessions") {
			sessionCalls.push(url);
			return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, data: rows }) });
		}
		taskCalls.push(url);
		const body = init?.body ? (JSON.parse(String(init.body)) as { ids?: string[] }) : {};
		const wanted = new Set(body.ids ?? []);
		return Promise.resolve({
			ok: true,
			json: () => Promise.resolve({ ok: true, data: tasks.filter((t) => wanted.has(t.id)) }),
		});
	});
	vi.stubGlobal("fetch", fetchMock);
	return { taskCalls, sessionCalls };
}

beforeEach(() => {
	vi.stubEnv("VITE_API_KEY", "");
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

describe("useAgentRunState", () => {
	// @lore activeSession carries no betId — tasks link via /work/task/:taskId.
	it("resolves the active run, its task title, and the success rate", async () => {
		stubFetch(
			[
				row({
					id: "r-live",
					agentId: "a1",
					taskId: "t1",
					state: "active",
					endedAt: null,
					outcome: null,
				}),
				row({ id: "r-done", agentId: "a1", taskId: "t2", outcome: "completed" }),
				row({ id: "r-crash", agentId: "a1", taskId: "t2", outcome: "crashed" }),
			],
			[
				{ id: "t1", title: "Live task", betId: "bet-1" },
				{ id: "t2", title: "Old task", betId: "bet-2" },
			],
		);

		const { result } = renderHook(() => useAgentRunState("a1", true));

		await waitFor(() => expect(result.current.status).toBe("ready"));
		expect(result.current.activeSession).toEqual({
			sessionId: "r-live",
			taskId: "t1",
			startedAt: expect.any(String),
		});
		expect(result.current.recentSessions.map((s) => s.taskTitle)).toEqual([
			"Live task",
			"Old task",
			"Old task",
		]);
		expect(result.current.performance).toEqual({
			totalSessions: 3,
			successCount: 1,
			successRate: 1 / 3,
		});
	});

	it("scopes the search to the agent, asking for every run it can (up to the action's cap)", async () => {
		const { sessionCalls } = stubFetch([row({ id: "r1", agentId: "a1" })], []);

		const { result } = renderHook(() => useAgentRunState("a1", true));
		await waitFor(() => expect(result.current.status).toBe("ready"));

		expect(sessionCalls).toHaveLength(1);
	});

	it("fetches task titles in ONE batched request, not one per task", async () => {
		const runs = Array.from({ length: 8 }, (_, i) =>
			row({ id: `r${i}`, agentId: "a1", taskId: `t${i}` }),
		);
		const { taskCalls } = stubFetch(
			runs,
			runs.map((r) => ({ id: r.taskId as string, title: `Task ${r.taskId}`, betId: null })),
		);

		const { result } = renderHook(() => useAgentRunState("a1", true));

		await waitFor(() => expect(result.current.status).toBe("ready"));
		expect(taskCalls).toHaveLength(1);
		expect(result.current.recentSessions).toHaveLength(8);
	});

	it("keeps at most the 10 most recent runs in the recent list", async () => {
		const runs = Array.from({ length: 14 }, (_, i) =>
			row({ id: `r${i}`, agentId: "a1", taskId: "t1", startedAt: iso(i * 1000) }),
		);
		stubFetch(runs, [{ id: "t1", title: "T", betId: null }]);

		const { result } = renderHook(() => useAgentRunState("a1", true));

		await waitFor(() => expect(result.current.status).toBe("ready"));
		expect(result.current.recentSessions).toHaveLength(10);
		expect(result.current.performance.totalSessions).toBe(14);
	});

	it("reports status 'error' when search_sessions answers a problem — it never claims healthy", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation((url: string) =>
				url === "/api/actions/search_sessions"
					? Promise.resolve({
							ok: true,
							json: () =>
								Promise.resolve({
									ok: false,
									problems: [{ code: "server_error", message: "Boom" }],
								}),
						})
					: Promise.resolve({
							ok: true,
							json: () => Promise.resolve({ ok: true, data: [] }),
						}),
			),
		);

		const { result } = renderHook(() => useAgentRunState("a1", true));

		await waitFor(() => expect(result.current.status).toBe("error"));
		expect(result.current.activeSession).toBeNull();
		expect(result.current.recentSessions).toEqual([]);
	});

	it("starts in 'loading', so a screen never paints zeros as fact", () => {
		stubFetch([], []);
		const { result } = renderHook(() => useAgentRunState("a1", true));
		expect(result.current.status).toBe("loading");
	});
});

describe("useRosterRunState", () => {
	it("groups runs by agent and marks only the running one active", async () => {
		stubFetch(
			[
				row({
					id: "r1",
					agentId: "a1",
					taskId: "t1",
					state: "active",
					endedAt: null,
					outcome: null,
				}),
				row({ id: "r2", agentId: "a2", outcome: "completed" }),
			],
			[{ id: "t1", title: "Live task", betId: "bet-9" }],
		);

		const { result } = renderHook(() =>
			useRosterRunState([{ agentId: "a1" }, { agentId: "a2" }, { agentId: "a3" }]),
		);

		await waitFor(() => expect(result.current.status).toBe("ready"));
		expect(result.current.byAgent.get("a1")).toMatchObject({
			operationalStatus: "active",
			activeTaskTitle: "Live task",
			activeTaskId: "t1",
		});
		expect(result.current.byAgent.get("a2")).toMatchObject({
			operationalStatus: "idle",
			healthLevel: "healthy",
		});
		// Every roster member gets an entry, even with zero fetched runs — it
		// defaults to idle/healthy rather than being left out of the map.
		expect(result.current.byAgent.has("a3")).toBe(true);
	});

	it("reports status 'error' when search_sessions answers a problem, rather than a healthy roster", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						ok: false,
						problems: [{ code: "server_error", message: "Boom" }],
					}),
			}),
		);

		const { result } = renderHook(() => useRosterRunState([{ agentId: "a1" }]));

		await waitFor(() => expect(result.current.status).toBe("error"));
		expect(result.current.byAgent.size).toBe(0);
	});
});
