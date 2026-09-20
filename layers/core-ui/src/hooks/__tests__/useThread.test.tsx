/**
 * useThread. One door: `call("open_thread", { id })`, kept live by the
 * `thread:<id>` websocket nudge. Mirrors the mocking
 * approach in `useAssistantThread.ws.test.tsx` (deleted): `call` is mocked
 * directly, and the global no-op `ws-client` mock (test-setup.ts) is
 * overridden with a captureable spy so a simulated WS frame can be fired at
 * the subscribed handler.
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { subscribeMock, unsubscribeMock, callMock } = vi.hoisted(() => {
	const unsubscribeMock = vi.fn();
	const subscribeMock = vi.fn().mockReturnValue(unsubscribeMock);
	const callMock = vi.fn();
	return { subscribeMock, unsubscribeMock, callMock };
});

// Override the global no-op ws-client mock with a captureable spy.
vi.mock("../../services/ws-client.js", () => ({
	getWsClient: () => ({
		subscribe: subscribeMock,
	}),
}));

vi.mock("../../services/call.js", () => ({
	call: callMock,
}));

import { useThread } from "../useThread.js";

function makeThreadView() {
	return {
		thread: {
			id: "thread-1",
			hostKind: "user" as const,
			hostId: "u-founder",
			initiatorId: "u-founder",
			members: ["u-founder"],
			title: null,
			computedTitle: "Founder",
			pinned: false,
			resolvedAt: null,
			deletedAt: null,
			lastActiveAt: "2026-04-30T12:00:00.000Z",
			createdAt: "2026-04-30T12:00:00.000Z",
		},
		members: [],
		messages: [],
		headMessageId: null,
		hostTitle: null,
	};
}

describe("useThread", () => {
	beforeEach(() => {
		callMock.mockReset();
		subscribeMock.mockReset();
		subscribeMock.mockReturnValue(unsubscribeMock);
		unsubscribeMock.mockReset();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("returns idle with no call and no subscription when no id is given", () => {
		const { result } = renderHook(() => useThread(undefined));

		expect(result.current.status).toBe("idle");
		expect(result.current.data).toBeNull();
		expect(result.current.error).toBeNull();
		expect(callMock).not.toHaveBeenCalled();
		expect(subscribeMock).not.toHaveBeenCalled();
	});

	it("loads once an id appears after starting idle", async () => {
		callMock.mockResolvedValue({ ok: true, data: makeThreadView() });

		const { result, rerender } = renderHook(({ id }: { id: string | undefined }) => useThread(id), {
			initialProps: { id: undefined as string | undefined },
		});

		expect(result.current.status).toBe("idle");
		expect(callMock).not.toHaveBeenCalled();

		rerender({ id: "thread-1" });

		await waitFor(() => expect(result.current.status).toBe("ready"));
		expect(callMock).toHaveBeenCalledWith("open_thread", { id: "thread-1" });
		expect(result.current.data?.thread.id).toBe("thread-1");
	});

	it("calls open_thread and returns the resolved data", async () => {
		callMock.mockResolvedValue({ ok: true, data: makeThreadView() });

		const { result } = renderHook(() => useThread("thread-1"));

		expect(callMock).toHaveBeenCalledWith("open_thread", { id: "thread-1" });
		await waitFor(() => expect(result.current.status).toBe("ready"));
		expect(result.current.data?.thread.id).toBe("thread-1");
		expect(result.current.error).toBeNull();
	});

	it("surfaces problems from a refused call", async () => {
		callMock.mockResolvedValue({
			ok: false,
			problems: [{ code: "forbidden", message: "Not a member of this thread." }],
		});

		const { result } = renderHook(() => useThread("thread-1"));

		await waitFor(() => expect(result.current.status).toBe("error"));
		expect(result.current.error).toBe("Not a member of this thread.");
		expect(result.current.data).toBeNull();
	});

	it("re-runs open_thread exactly once on a thread:<id> websocket frame", async () => {
		callMock.mockResolvedValue({ ok: true, data: makeThreadView() });
		let capturedHandler: ((data: unknown) => void) | null = null;
		subscribeMock.mockImplementation((_topic: string, handler: (data: unknown) => void) => {
			capturedHandler = handler;
			return unsubscribeMock;
		});

		const { result } = renderHook(() => useThread("thread-1"));
		await waitFor(() => expect(result.current.status).toBe("ready"));
		expect(subscribeMock).toHaveBeenCalledWith("thread:thread-1", expect.any(Function));

		const callCountBefore = callMock.mock.calls.length;

		await act(async () => {
			capturedHandler?.({ type: "update", topic: "thread:thread-1" });
		});

		await waitFor(() => expect(callMock.mock.calls.length).toBe(callCountBefore + 1));
		// Exactly one re-run — not more from a duplicate subscription firing twice.
		expect(callMock.mock.calls.length).toBe(callCountBefore + 1);
	});

	it("does not re-run on a frame for a different topic", async () => {
		callMock.mockResolvedValue({ ok: true, data: makeThreadView() });
		let capturedHandler: ((data: unknown) => void) | null = null;
		subscribeMock.mockImplementation((_topic: string, handler: (data: unknown) => void) => {
			capturedHandler = handler;
			return unsubscribeMock;
		});

		const { result } = renderHook(() => useThread("thread-1"));
		await waitFor(() => expect(result.current.status).toBe("ready"));

		const callCountBefore = callMock.mock.calls.length;

		await act(async () => {
			capturedHandler?.({ type: "update", topic: "conversations" });
		});

		await new Promise((r) => setTimeout(r, 20));
		expect(callMock.mock.calls.length).toBe(callCountBefore);
	});

	it("unsubscribes on unmount", async () => {
		callMock.mockResolvedValue({ ok: true, data: makeThreadView() });

		const { result, unmount } = renderHook(() => useThread("thread-1"));
		await waitFor(() => expect(result.current.status).toBe("ready"));

		expect(unsubscribeMock).not.toHaveBeenCalled();
		unmount();
		expect(unsubscribeMock).toHaveBeenCalledTimes(1);
	});
});
