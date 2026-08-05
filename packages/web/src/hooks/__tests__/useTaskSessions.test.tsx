/**
 * A task's runs, read from `agent-orchestration` and projected for the task view.
 *
 * @lore AU26 J4: `GET /api/tasks/:id/sessions` was a core-api route whose entire
 * payload was agent-run data — core reading `agent-orchestration`'s `sessions`
 * table. It is deleted. `useTaskSessions` calls
 * `GET /api/agent-orchestration/runs?task_id=…` and does the projection the
 * route used to do. This file is where that projection is now covered: the
 * `Session N` numbering (which needs OLDEST-first order, so the newest-first run
 * read is reversed), the `status` field keyed off the run's `state` (so a
 * cascade-stopped run reports `stopped`, never blank), and the effectiveness
 * score parse.
 */

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useTaskSessions } from "../useTaskSessions.js";

interface WireRun {
	id: string;
	agentId: string;
	taskId: string | null;
	startedAt: string;
	endedAt: string | null;
	state: string | null;
	outcome: string | null;
	effectivenessScore: string | null;
}

function run(overrides: Partial<WireRun> = {}): WireRun {
	return {
		id: overrides.id ?? "run-1",
		agentId: overrides.agentId ?? "agent-1",
		taskId: overrides.taskId ?? "task-1",
		startedAt: overrides.startedAt ?? "2026-08-01T00:00:00.000Z",
		endedAt: overrides.endedAt ?? null,
		state: overrides.state ?? "active",
		outcome: overrides.outcome ?? null,
		effectivenessScore: overrides.effectivenessScore ?? null,
	};
}

/** The route serves newest-first. */
function stubRuns(runs: WireRun[]): ReturnType<typeof vi.fn> {
	const fetchMock = vi.fn().mockResolvedValue({
		ok: true,
		json: () => Promise.resolve({ runs }),
	});
	global.fetch = fetchMock as unknown as typeof fetch;
	return fetchMock;
}

describe("useTaskSessions", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("calls agent-orchestration's run read, scoped to the task", async () => {
		const fetchMock = stubRuns([]);
		const { result } = renderHook(() => useTaskSessions("task-1"));
		await waitFor(() => expect(result.current.isLoading).toBe(false));

		const url = fetchMock.mock.calls[0]?.[0] as string;
		expect(url).toContain("/api/agent-orchestration/runs");
		expect(url).toContain("task_id=task-1");
	});

	it("numbers sessions oldest-first even though the read serves newest-first", async () => {
		stubRuns([
			run({ id: "run-new", startedAt: "2026-08-03T00:00:00.000Z" }),
			run({ id: "run-old", startedAt: "2026-08-01T00:00:00.000Z", state: "done" }),
		]);
		const { result } = renderHook(() => useTaskSessions("task-1"));
		await waitFor(() => expect(result.current.data).not.toBeNull());

		expect(result.current.data?.sessions.map((s) => [s.id, s.title])).toEqual([
			["run-old", "Session 1"],
			["run-new", "Session 2"],
		]);
	});

	it("keys status off the run's state so a stopped run is never blank", async () => {
		stubRuns([
			run({ id: "run-stopped", state: "stopped", outcome: "stopped" }),
			run({ id: "run-active", state: "active" }),
		]);
		const { result } = renderHook(() => useTaskSessions("task-1"));
		await waitFor(() => expect(result.current.data).not.toBeNull());

		const byId = new Map(result.current.data?.sessions.map((s) => [s.id, s.status]));
		expect(byId.get("run-stopped")).toBe("stopped");
		expect(byId.get("run-active")).toBe("active");
	});

	it("parses the effectiveness score, and yields null when absent or unparseable", async () => {
		stubRuns([
			run({ id: "run-scored", effectivenessScore: "0.75" }),
			run({ id: "run-unscored", effectivenessScore: null }),
			run({ id: "run-garbage", effectivenessScore: "not-a-number" }),
		]);
		const { result } = renderHook(() => useTaskSessions("task-1"));
		await waitFor(() => expect(result.current.data).not.toBeNull());

		const byId = new Map(result.current.data?.sessions.map((s) => [s.id, s.effectivenessScore]));
		expect(byId.get("run-scored")).toBe(0.75);
		expect(byId.get("run-unscored")).toBeNull();
		expect(byId.get("run-garbage")).toBeNull();
	});

	it("returns an empty list for a task with no runs", async () => {
		stubRuns([]);
		const { result } = renderHook(() => useTaskSessions("task-1"));
		await waitFor(() => expect(result.current.data).not.toBeNull());
		expect(result.current.data?.sessions).toEqual([]);
	});

	it("fetches nothing and reports no data when the task id is undefined", async () => {
		const fetchMock = stubRuns([]);
		const { result } = renderHook(() => useTaskSessions(undefined));
		await waitFor(() => expect(result.current.isLoading).toBe(false));
		expect(result.current.data).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("surfaces an error when the run read fails", async () => {
		global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;
		const { result } = renderHook(() => useTaskSessions("task-1"));
		await waitFor(() => expect(result.current.error).not.toBeNull());
		expect(result.current.error).toContain("500");
	});
});
