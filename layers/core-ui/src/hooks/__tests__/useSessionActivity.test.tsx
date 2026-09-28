/**
 * useSessionActivity — a session's row + activity buffer, kept live by the
 * `session:<id>` websocket nudge.
 *
 * @lore call is mocked directly and the global ws-client no-op mock is overridden with a spy so a simulated nudge frame reaches the subscribed handler.
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { subscribeMock, unsubscribeMock, callMock } = vi.hoisted(() => {
	const unsubscribeMock = vi.fn();
	const subscribeMock = vi.fn().mockReturnValue(unsubscribeMock);
	const callMock = vi.fn();
	return { subscribeMock, unsubscribeMock, callMock };
});

vi.mock("../../services/ws-client.js", () => ({
	getWsClient: () => ({
		subscribe: subscribeMock,
	}),
}));

vi.mock("../../services/call.js", () => ({
	call: callMock,
}));

import { type ToolCallData, useSessionActivity } from "../useSessionActivity.js";

function mkSession(state: "active" | "done" = "active") {
	return {
		id: "sess-1",
		agentId: "agent-1",
		taskId: "task-1",
		startedAt: "2026-09-22T00:00:00.000Z",
		endedAt: state === "active" ? null : "2026-09-22T00:05:00.000Z",
		state,
		outcome: state === "active" ? null : "completed",
		routineId: null,
		notes: null,
		modelTier: "workhorse",
		sourceKind: null,
	};
}

function mkActivity(n = 2) {
	return Array.from({ length: n }, (_, i) => ({
		type: "tool_call" as const,
		timestamp: Date.now() + i,
		data: { toolName: `tool_${i}`, argsSummary: "" },
	}));
}

describe("useSessionActivity", () => {
	beforeEach(() => {
		callMock.mockReset();
		subscribeMock.mockReset();
		subscribeMock.mockReturnValue(unsubscribeMock);
		unsubscribeMock.mockReset();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("calls watch_session with the id and transitions connecting → streaming", async () => {
		callMock.mockResolvedValue({
			ok: true,
			data: { session: mkSession(), activity: mkActivity(3) },
		});

		const { result } = renderHook(() => useSessionActivity("sess-1"));
		expect(result.current.status).toBe("connecting");
		expect(callMock).toHaveBeenCalledWith("watch_session", { id: "sess-1" });

		await waitFor(() => expect(result.current.status).toBe("streaming"));
		expect(result.current.entries.length).toBe(3);
	});

	it("entries have type, timestamp, and data fields", async () => {
		callMock.mockResolvedValue({
			ok: true,
			data: { session: mkSession(), activity: mkActivity(1) },
		});

		const { result } = renderHook(() => useSessionActivity("sess-1"));
		await waitFor(() => expect(result.current.status).toBe("streaming"));

		expect(result.current.entries[0]!.type).toBe("tool_call");
		expect(typeof result.current.entries[0]!.timestamp).toBe("number");
		expect((result.current.entries[0]!.data as ToolCallData).toolName).toBe("tool_0");
	});

	it("transitions to 'ended' when the session's state is no longer active", async () => {
		callMock.mockResolvedValue({
			ok: true,
			data: { session: mkSession("done"), activity: mkActivity(5) },
		});

		const { result } = renderHook(() => useSessionActivity("sess-1"));
		await waitFor(() => expect(result.current.status).toBe("ended"));
		expect(result.current.summary).toEqual({
			agentId: "agent-1",
			taskId: "task-1",
			endedAt: "2026-09-22T00:05:00.000Z",
		});
	});

	it("transitions to error state when watch_session is refused", async () => {
		callMock.mockResolvedValue({
			ok: false,
			problems: [{ code: "not_found", message: "Session sess-1 not found." }],
		});

		const { result } = renderHook(() => useSessionActivity("sess-1"));
		await waitFor(() => expect(result.current.status).toBe("error"));
		expect(result.current.error).toBe("Session sess-1 not found.");
	});

	it("transitions to error state on network failure", async () => {
		callMock.mockRejectedValue(new TypeError("Network error"));

		const { result } = renderHook(() => useSessionActivity("sess-1"));
		await waitFor(() => expect(result.current.status).toBe("error"));
	});

	it("summary is null while streaming", async () => {
		callMock.mockResolvedValue({
			ok: true,
			data: { session: mkSession(), activity: mkActivity(2) },
		});

		const { result } = renderHook(() => useSessionActivity("sess-1"));
		await waitFor(() => expect(result.current.status).toBe("streaming"));
		expect(result.current.summary).toBeNull();
	});

	it("subscribes to session:<id> and re-runs watch_session exactly once on a nudge — never asserting 'ended' from the nudge itself", async () => {
		callMock.mockResolvedValue({
			ok: true,
			data: { session: mkSession(), activity: mkActivity(1) },
		});
		let capturedHandler: ((data: unknown) => void) | null = null;
		subscribeMock.mockImplementation((_topic: string, handler: (data: unknown) => void) => {
			capturedHandler = handler;
			return unsubscribeMock;
		});

		const { result } = renderHook(() => useSessionActivity("sess-1"));
		await waitFor(() => expect(result.current.status).toBe("streaming"));
		expect(subscribeMock).toHaveBeenCalledWith("session:sess-1", expect.any(Function));

		const callCountBefore = callMock.mock.calls.length;
		// The nudge carries no content — a bare topic-matching envelope. It
		// must not, by itself, flip status to "ended".
		callMock.mockResolvedValue({
			ok: true,
			data: { session: mkSession("done"), activity: mkActivity(1) },
		});

		await act(async () => {
			capturedHandler?.({ type: "update", topic: "session:sess-1", kind: "session.activity" });
		});

		await waitFor(() => expect(callMock.mock.calls.length).toBe(callCountBefore + 1));
		await waitFor(() => expect(result.current.status).toBe("ended"));
	});

	it("does not re-run on a frame for a different topic", async () => {
		callMock.mockResolvedValue({
			ok: true,
			data: { session: mkSession(), activity: mkActivity(1) },
		});
		let capturedHandler: ((data: unknown) => void) | null = null;
		subscribeMock.mockImplementation((_topic: string, handler: (data: unknown) => void) => {
			capturedHandler = handler;
			return unsubscribeMock;
		});

		const { result } = renderHook(() => useSessionActivity("sess-1"));
		await waitFor(() => expect(result.current.status).toBe("streaming"));

		const callCountBefore = callMock.mock.calls.length;

		await act(async () => {
			capturedHandler?.({ type: "update", topic: "session:sess-2" });
		});

		await new Promise((r) => setTimeout(r, 20));
		expect(callMock.mock.calls.length).toBe(callCountBefore);
	});

	it("unsubscribes on unmount", async () => {
		callMock.mockResolvedValue({
			ok: true,
			data: { session: mkSession(), activity: mkActivity(1) },
		});

		const { result, unmount } = renderHook(() => useSessionActivity("sess-1"));
		await waitFor(() => expect(result.current.status).toBe("streaming"));

		expect(unsubscribeMock).not.toHaveBeenCalled();
		unmount();
		expect(unsubscribeMock).toHaveBeenCalledTimes(1);
	});
});
