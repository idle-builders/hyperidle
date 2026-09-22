/**
 * A task's sessions, read through the session action list.
 *
 * @lore BC6: `GET /api/tasks/:id/sessions` (later `GET
 * /api/agent-orchestration/runs?task_id=…`) is deleted; `useTaskSessions`
 * calls `search_sessions({ taskId })` — `POST /api/actions/search_sessions`,
 * the same door a person's client and an agent's MCP tool use — and does the
 * projection the old route used to do. This file is where that projection is
 * covered: the `Session N` numbering (which needs OLDEST-first order, so the
 * newest-first search read is reversed), the `status` field keyed off the
 * row's `state` (so a cascade-stopped run reports `stopped`, never blank),
 * and the effectiveness score parse.
 */

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useTaskSessions } from "../useTaskSessions.js";

interface WireRow {
	id: string;
	agentId: string;
	taskId: string | null;
	startedAt: string;
	endedAt: string | null;
	state: string | null;
	outcome: string | null;
	effectivenessScore: string | null;
}

function row(overrides: Partial<WireRow> = {}): WireRow {
	return {
		id: overrides.id ?? "session-1",
		agentId: overrides.agentId ?? "agent-1",
		taskId: overrides.taskId ?? "task-1",
		startedAt: overrides.startedAt ?? "2026-08-01T00:00:00.000Z",
		endedAt: overrides.endedAt ?? null,
		state: overrides.state ?? "active",
		outcome: overrides.outcome ?? null,
		effectivenessScore: overrides.effectivenessScore ?? null,
	};
}

/** `search_sessions` answers `{ ok: true, data }`, newest first. */
function stubSessions(rows: WireRow[]): ReturnType<typeof vi.fn> {
	const fetchMock = vi.fn().mockResolvedValue({
		ok: true,
		json: () => Promise.resolve({ ok: true, data: rows }),
	});
	global.fetch = fetchMock as unknown as typeof fetch;
	return fetchMock;
}

function lastBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
	const call = fetchMock.mock.calls[0] as [string, RequestInit];
	return JSON.parse(String(call[1]?.body)) as Record<string, unknown>;
}

describe("useTaskSessions", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("calls search_sessions, scoped to the task", async () => {
		const fetchMock = stubSessions([]);
		const { result } = renderHook(() => useTaskSessions("task-1"));
		await waitFor(() => expect(result.current.isLoading).toBe(false));

		const url = fetchMock.mock.calls[0]?.[0] as string;
		expect(url).toBe("/api/actions/search_sessions");
		expect(lastBody(fetchMock)).toMatchObject({ taskId: "task-1" });
	});

	it("orders sessions oldest-first even though the read serves newest-first", async () => {
		stubSessions([
			row({ id: "session-new", startedAt: "2026-08-03T00:00:00.000Z" }),
			row({ id: "session-old", startedAt: "2026-08-01T00:00:00.000Z", state: "done" }),
		]);
		const { result } = renderHook(() => useTaskSessions("task-1"));
		await waitFor(() => expect(result.current.data).not.toBeNull());

		const sessions = result.current.data?.sessions ?? [];
		// UI-036: titles are formatted dates, not ordinals ("Session N").
		// Oldest-first order preserved; session-old (2026-08-01) precedes session-new (2026-08-03).
		expect(sessions.map((s) => s.id)).toEqual(["session-old", "session-new"]);
		expect(sessions[0]?.title).toMatch(/Aug.*1.*2026|1.*Aug.*2026/);
		expect(sessions[1]?.title).toMatch(/Aug.*3.*2026|3.*Aug.*2026/);
		// Titles must NOT be the old ordinal format
		expect(sessions[0]?.title).not.toBe("Session 1");
		expect(sessions[1]?.title).not.toBe("Session 2");
	});

	it("keys status off the row's state so a stopped session is never blank", async () => {
		stubSessions([
			row({ id: "session-stopped", state: "stopped", outcome: "stopped" }),
			row({ id: "session-active", state: "active" }),
		]);
		const { result } = renderHook(() => useTaskSessions("task-1"));
		await waitFor(() => expect(result.current.data).not.toBeNull());

		const byId = new Map(result.current.data?.sessions.map((s) => [s.id, s.status]));
		expect(byId.get("session-stopped")).toBe("stopped");
		expect(byId.get("session-active")).toBe("active");
	});

	it("parses the effectiveness score, and yields null when absent or unparseable", async () => {
		stubSessions([
			row({ id: "session-scored", effectivenessScore: "0.75" }),
			row({ id: "session-unscored", effectivenessScore: null }),
			row({ id: "session-garbage", effectivenessScore: "not-a-number" }),
		]);
		const { result } = renderHook(() => useTaskSessions("task-1"));
		await waitFor(() => expect(result.current.data).not.toBeNull());

		const byId = new Map(result.current.data?.sessions.map((s) => [s.id, s.effectivenessScore]));
		expect(byId.get("session-scored")).toBe(0.75);
		expect(byId.get("session-unscored")).toBeNull();
		expect(byId.get("session-garbage")).toBeNull();
	});

	it("returns an empty list for a task with no sessions", async () => {
		stubSessions([]);
		const { result } = renderHook(() => useTaskSessions("task-1"));
		await waitFor(() => expect(result.current.data).not.toBeNull());
		expect(result.current.data?.sessions).toEqual([]);
	});

	it("fetches nothing and reports no data when the task id is undefined", async () => {
		const fetchMock = stubSessions([]);
		const { result } = renderHook(() => useTaskSessions(undefined));
		await waitFor(() => expect(result.current.isLoading).toBe(false));
		expect(result.current.data).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("surfaces an error when search_sessions answers a problem", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: false,
			json: () =>
				Promise.resolve({ ok: false, problems: [{ code: "server_error", message: "Boom" }] }),
		}) as unknown as typeof fetch;
		const { result } = renderHook(() => useTaskSessions("task-1"));
		await waitFor(() => expect(result.current.error).not.toBeNull());
		expect(result.current.error).toBe("Boom");
	});
});
