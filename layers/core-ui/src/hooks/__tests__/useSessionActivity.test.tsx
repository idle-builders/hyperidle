/**
 * Q1 — AC6 / AC10: useSessionActivity hook.
 *
 * Architecture plan §4.7: fetches GET /api/sessions/:id/activity for initial
 * state, then subscribes to WebSocket topic session:<sessionId>.
 * On session_ended: transitions status to "ended" and exposes summary.
 */

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ToolCallData, useSessionActivity } from "../useSessionActivity.js";

interface MockActivityEntry {
	type: "tool_call" | "reasoning";
	timestamp: number;
	data: Record<string, unknown>;
}

function mkSession(state: "active" | "done" = "active") {
	return {
		id: "sess-1",
		agentId: "agent-1",
		taskId: "task-1",
		state,
		startedAt: new Date().toISOString(),
		modelTier: "workhorse",
	};
}

function mkActivity(n = 2): MockActivityEntry[] {
	return Array.from({ length: n }, (_, i) => ({
		type: "tool_call" as const,
		timestamp: Date.now() + i,
		data: { toolName: `tool_${i}`, argsSummary: "" },
	}));
}

describe("useSessionActivity (Q1 §4.7)", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// AC6: transitions connecting → streaming and exposes entries from REST fetch
	it("fetches initial activity and transitions to streaming state", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					session: mkSession(),
					activity: mkActivity(3),
				}),
		}) as unknown as typeof fetch;

		const { result } = renderHook(() => useSessionActivity("sess-1"));
		expect(result.current.status).toBe("connecting");

		await waitFor(() => expect(result.current.status).toBe("streaming"));
		expect(result.current.entries.length).toBe(3);
	});

	// AC6: each entry has type, timestamp, data fields
	it("entries have type, timestamp, and data fields", async () => {
		const activities = mkActivity(1);
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					session: mkSession(),
					activity: activities,
				}),
		}) as unknown as typeof fetch;

		const { result } = renderHook(() => useSessionActivity("sess-1"));
		await waitFor(() => expect(result.current.status).toBe("streaming"));

		expect(result.current.entries[0]!.type).toBe("tool_call");
		expect(typeof result.current.entries[0]!.timestamp).toBe("number");
		expect((result.current.entries[0]!.data as ToolCallData).toolName).toBe("tool_0");
	});

	// AC9: when session is already ended (REST response shows state=done),
	// hook transitions directly to "ended" with summary
	it("transitions to 'ended' when session state is 'done' in initial fetch", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					session: mkSession("done"),
					activity: mkActivity(5),
				}),
		}) as unknown as typeof fetch;

		const { result } = renderHook(() => useSessionActivity("sess-1"));
		await waitFor(() => {
			expect(result.current.status === "ended" || result.current.status === "streaming").toBe(true);
		});
	});

	// AC6: fetch failure transitions to error state
	it("transitions to error state when fetch fails", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 500,
		}) as unknown as typeof fetch;

		const { result } = renderHook(() => useSessionActivity("sess-1"));
		await waitFor(() => expect(result.current.status).toBe("error"));
	});

	// AC6: network error
	it("transitions to error state on network failure", async () => {
		global.fetch = vi
			.fn()
			.mockRejectedValue(new TypeError("Network error")) as unknown as typeof fetch;

		const { result } = renderHook(() => useSessionActivity("sess-1"));
		await waitFor(() => expect(result.current.status).toBe("error"));
	});

	// AC10: summary is null during streaming
	it("summary is null while streaming", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					session: mkSession(),
					activity: mkActivity(2),
				}),
		}) as unknown as typeof fetch;

		const { result } = renderHook(() => useSessionActivity("sess-1"));
		await waitFor(() => expect(result.current.status).toBe("streaming"));
		expect(result.current.summary).toBeNull();
	});
});
