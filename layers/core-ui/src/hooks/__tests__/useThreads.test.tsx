/**
 * useThreads — BC3. One door: `call("search_threads", filter)`, kept live
 * by the global `conversations` websocket nudge (architecture.md §3.12).
 * Mirrors the mocking approach in `useConversationsThreads.ws.test.tsx`
 * (deleted): `call` is mocked directly, and the global no-op `ws-client`
 * mock (test-setup.ts) is overridden with a captureable spy.
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

import { useThreads } from "../useThreads.js";

function makeThreadListRow(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		id: "t1",
		hostKind: "user",
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
		hasUnresolvedReview: false,
		lastMessagePreview: null,
		...overrides,
	};
}

describe("useThreads", () => {
	beforeEach(() => {
		callMock.mockReset();
		subscribeMock.mockReset();
		subscribeMock.mockReturnValue(unsubscribeMock);
		unsubscribeMock.mockReset();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("calls search_threads with the given filter and returns the resolved data", async () => {
		callMock.mockResolvedValue({ ok: true, data: [makeThreadListRow()] });

		const { result } = renderHook(() => useThreads({ mine: true }));

		expect(callMock).toHaveBeenCalledWith("search_threads", { mine: true });
		await waitFor(() => expect(result.current.status).toBe("ready"));
		expect(result.current.threads).toHaveLength(1);
		expect(result.current.error).toBeNull();
	});

	it("surfaces problems from a refused call", async () => {
		callMock.mockResolvedValue({
			ok: false,
			problems: [{ code: "invalid_filter", message: "Filter too broad." }],
		});

		const { result } = renderHook(() => useThreads({ mine: true }));

		await waitFor(() => expect(result.current.status).toBe("error"));
		expect(result.current.error).toBe("Filter too broad.");
		expect(result.current.threads).toHaveLength(0);
	});

	it("re-runs search_threads exactly once on a conversations websocket frame", async () => {
		callMock.mockResolvedValue({ ok: true, data: [makeThreadListRow()] });
		let capturedHandler: ((data: unknown) => void) | null = null;
		subscribeMock.mockImplementation((_topic: string, handler: (data: unknown) => void) => {
			capturedHandler = handler;
			return unsubscribeMock;
		});

		const { result } = renderHook(() => useThreads({ mine: true }));
		await waitFor(() => expect(result.current.status).toBe("ready"));
		expect(subscribeMock).toHaveBeenCalledWith("conversations", expect.any(Function));

		const callCountBefore = callMock.mock.calls.length;

		await act(async () => {
			capturedHandler?.({ type: "update", topic: "conversations" });
		});

		await waitFor(() => expect(callMock.mock.calls.length).toBe(callCountBefore + 1));
		expect(callMock.mock.calls.length).toBe(callCountBefore + 1);
	});

	it("does not re-run on a frame for a different topic", async () => {
		callMock.mockResolvedValue({ ok: true, data: [makeThreadListRow()] });
		let capturedHandler: ((data: unknown) => void) | null = null;
		subscribeMock.mockImplementation((_topic: string, handler: (data: unknown) => void) => {
			capturedHandler = handler;
			return unsubscribeMock;
		});

		const { result } = renderHook(() => useThreads({ mine: true }));
		await waitFor(() => expect(result.current.status).toBe("ready"));

		const callCountBefore = callMock.mock.calls.length;

		await act(async () => {
			capturedHandler?.({ type: "update", topic: `thread:${"t1"}` });
		});

		await new Promise((r) => setTimeout(r, 20));
		expect(callMock.mock.calls.length).toBe(callCountBefore);
	});

	it("unsubscribes on unmount", async () => {
		callMock.mockResolvedValue({ ok: true, data: [makeThreadListRow()] });

		const { result, unmount } = renderHook(() => useThreads({ mine: true }));
		await waitFor(() => expect(result.current.status).toBe("ready"));

		expect(unsubscribeMock).not.toHaveBeenCalled();
		unmount();
		expect(unsubscribeMock).toHaveBeenCalledTimes(1);
	});
});
