/**
 * useThreadTasks — BC3 Confusion 9. `call("search_tasks", { threadId })`,
 * kept live by the `thread:<id>` websocket nudge. Mirrors
 * `useThread.test.tsx`'s mocking approach: `call` is mocked directly, and the
 * global no-op `ws-client` mock (test-setup.ts) is overridden with a
 * captureable spy so a simulated WS frame can be fired at the subscribed
 * handler.
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

import { useThreadTasks } from "../useThreadTasks.js";

function makeTask(id: string, overrides: Partial<Record<string, unknown>> = {}) {
	return {
		id,
		parentTaskId: null,
		teamId: "team-1",
		ownerAgentId: null,
		title: `Task ${id}`,
		description: null,
		doneCondition: null,
		state: "proposed" as const,
		dependencies: null,
		threadId: "thread-1",
		notes: null,
		createdAt: "2026-04-30T12:00:00.000Z",
		updatedAt: "2026-04-30T12:00:00.000Z",
		outcomeVerdict: null,
		outcomeSummary: null,
		outcomeRecordedAt: null,
		outcomeRecordedBy: null,
		tokensActualJson: null,
		sourceKnowledgeItemId: null,
		completedAt: null,
		position: 0,
		needsReview: false,
		...overrides,
	};
}

describe("useThreadTasks", () => {
	beforeEach(() => {
		callMock.mockReset();
		subscribeMock.mockReset();
		subscribeMock.mockReturnValue(unsubscribeMock);
		unsubscribeMock.mockReset();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("calls search_tasks with the threadId and returns the resolved tasks", async () => {
		callMock.mockResolvedValue({ ok: true, data: [makeTask("t-1")] });

		const { result } = renderHook(() => useThreadTasks("thread-1"));

		expect(callMock).toHaveBeenCalledWith("search_tasks", { threadId: "thread-1" });
		await waitFor(() => expect(result.current.tasks).toHaveLength(1));
		expect(result.current.tasks[0]?.id).toBe("t-1");
		expect(result.current.problems).toEqual([]);
	});

	it("returns no tasks and no call when threadId is absent", () => {
		const { result } = renderHook(() => useThreadTasks(undefined));

		expect(callMock).not.toHaveBeenCalled();
		expect(result.current.tasks).toEqual([]);
		expect(result.current.problems).toEqual([]);
	});

	it("surfaces problems from a refused call", async () => {
		callMock.mockResolvedValue({
			ok: false,
			problems: [{ code: "forbidden", message: "Not a member of this thread." }],
		});

		const { result } = renderHook(() => useThreadTasks("thread-1"));

		await waitFor(() => expect(result.current.problems).toHaveLength(1));
		expect(result.current.problems[0]?.message).toBe("Not a member of this thread.");
		expect(result.current.tasks).toEqual([]);
	});

	it("re-runs search_tasks exactly once on a thread:<id> websocket frame", async () => {
		callMock.mockResolvedValue({ ok: true, data: [makeTask("t-1")] });
		let capturedHandler: ((data: unknown) => void) | null = null;
		subscribeMock.mockImplementation((_topic: string, handler: (data: unknown) => void) => {
			capturedHandler = handler;
			return unsubscribeMock;
		});

		const { result } = renderHook(() => useThreadTasks("thread-1"));
		await waitFor(() => expect(result.current.tasks).toHaveLength(1));
		expect(subscribeMock).toHaveBeenCalledWith("thread:thread-1", expect.any(Function));

		const callCountBefore = callMock.mock.calls.length;

		await act(async () => {
			capturedHandler?.({ type: "update", topic: "thread:thread-1" });
		});

		await waitFor(() => expect(callMock.mock.calls.length).toBe(callCountBefore + 1));
		expect(callMock.mock.calls.length).toBe(callCountBefore + 1);
	});

	it("does not re-run on a frame for a different topic", async () => {
		callMock.mockResolvedValue({ ok: true, data: [makeTask("t-1")] });
		let capturedHandler: ((data: unknown) => void) | null = null;
		subscribeMock.mockImplementation((_topic: string, handler: (data: unknown) => void) => {
			capturedHandler = handler;
			return unsubscribeMock;
		});

		const { result } = renderHook(() => useThreadTasks("thread-1"));
		await waitFor(() => expect(result.current.tasks).toHaveLength(1));

		const callCountBefore = callMock.mock.calls.length;

		await act(async () => {
			capturedHandler?.({ type: "update", topic: "conversations" });
		});

		await new Promise((r) => setTimeout(r, 20));
		expect(callMock.mock.calls.length).toBe(callCountBefore);
	});

	it("unsubscribes on unmount", async () => {
		callMock.mockResolvedValue({ ok: true, data: [] });

		const { result, unmount } = renderHook(() => useThreadTasks("thread-1"));
		await waitFor(() => expect(callMock).toHaveBeenCalled());
		expect(result.current.tasks).toEqual([]);

		expect(unsubscribeMock).not.toHaveBeenCalled();
		unmount();
		expect(unsubscribeMock).toHaveBeenCalledTimes(1);
	});
});
