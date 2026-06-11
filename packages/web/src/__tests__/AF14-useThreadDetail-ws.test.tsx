/**
 * AF14 — AC3: Reply in open thread appears without manual reload.
 *
 * The WS subscription effect subscribes to `thread:<threadId>` and bumps
 * tick on `thread_message_appended` events, triggering a re-fetch.
 *
 * These tests are RED until `useThreadDetail` gains the WS subscription
 * effect (mirroring `useConversationsThreads.ts:213-225`).
 *
 * WS is unavailable in JSDOM — mock `ws-client` via the global test-setup
 * path and override per test.
 *
 * @lore AF14: ws-client is globally mocked in test-setup.ts as a no-op.
 * Per-test capture uses vi.hoisted + vi.mock with the SAME path the global
 * setup uses (`./services/ws-client.js` relative to src/). This overrides
 * the global no-op with a spy for assertion in this file.
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted ensures mocks are initialized before vi.mock() factory runs
// (which is hoisted to the top of the file by vitest's transformer).
const { subscribeMock, unsubscribeMock, apiFetchMock } = vi.hoisted(() => {
	const unsubscribeMock = vi.fn();
	const subscribeMock = vi.fn().mockReturnValue(unsubscribeMock);
	const apiFetchMock = vi.fn();
	return { subscribeMock, unsubscribeMock, apiFetchMock };
});

// Override the global no-op ws-client mock with a captureable spy.
// Path must match the global setup path exactly (resolved from src/).
vi.mock("../services/ws-client.js", () => ({
	getWsClient: () => ({
		subscribe: subscribeMock,
	}),
}));

// Mock apiFetch (path from src/__tests__ = ../services/api-fetch.js)
vi.mock("../services/api-fetch.js", () => ({
	apiFetch: apiFetchMock,
}));

// Import AFTER mocks are registered
import { useThreadDetail } from "../hooks/useThreadDetail";

function makeThreadDetailResponse() {
	return {
		thread: {
			id: "thread-abc",
			hostKind: "task",
			hostId: "task-1",
			initiatorId: "u-founder",
			participants: ["u-founder", "agent-1"],
			pinned: false,
			resolvedAt: null,
			lastActiveAt: "2026-06-11T10:00:00.000Z",
			createdAt: "2026-06-11T09:00:00.000Z",
		},
		messages: [
			{
				id: "msg-1",
				threadId: "thread-abc",
				senderId: "agent-1",
				clientKey: "k1",
				type: "plain",
				payload: { text: "Hello" },
				deletedAt: null,
				redactedAt: null,
				resolvedAt: null,
				createdAt: "2026-06-11T10:00:00.000Z",
			},
		],
		headMessageId: "msg-1",
		identities: {},
		hostTitle: null,
	};
}

describe("AF14 AC3 — useThreadDetail WS subscription", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		unsubscribeMock.mockReset();
		subscribeMock.mockReturnValue(unsubscribeMock);
		apiFetchMock.mockResolvedValue({
			ok: true,
			status: 200,
			json: () => Promise.resolve(makeThreadDetailResponse()),
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("subscribes to thread:<threadId> on mount", async () => {
		const { result } = renderHook(() => useThreadDetail("thread-abc"));

		await waitFor(() => {
			expect(result.current.status).toBe("ready");
		});

		// Should have subscribed to the thread-specific channel
		expect(subscribeMock).toHaveBeenCalledWith(
			"thread:thread-abc",
			expect.any(Function),
		);
	});

	it("calls unsubscribe on unmount (no leak)", async () => {
		const { result, unmount } = renderHook(() => useThreadDetail("thread-abc"));

		await waitFor(() => {
			expect(result.current.status).toBe("ready");
		});

		unmount();

		// unsubscribeMock should have been called (returned by subscribe)
		expect(unsubscribeMock).toHaveBeenCalled();
	});

	it("re-fetches when thread_message_appended event fires for the open thread", async () => {
		let capturedHandler: ((data: unknown) => void) | null = null;

		subscribeMock.mockImplementation((_channel: string, handler: (data: unknown) => void) => {
			capturedHandler = handler;
			return unsubscribeMock;
		});

		const { result } = renderHook(() => useThreadDetail("thread-abc"));

		await waitFor(() => {
			expect(result.current.status).toBe("ready");
		});

		const callCountBefore = apiFetchMock.mock.calls.length;

		// Fire the WS event for the open thread
		await act(async () => {
			capturedHandler?.({
				type: "thread_message_appended",
				threadId: "thread-abc",
				messageId: "msg-2",
			});
		});

		// Should have triggered a re-fetch
		await waitFor(() => {
			expect(apiFetchMock.mock.calls.length).toBeGreaterThan(callCountBefore);
		});
	});

	it("does NOT re-fetch for thread_message_appended of a DIFFERENT thread", async () => {
		let capturedHandler: ((data: unknown) => void) | null = null;

		subscribeMock.mockImplementation((_channel: string, handler: (data: unknown) => void) => {
			capturedHandler = handler;
			return unsubscribeMock;
		});

		const { result } = renderHook(() => useThreadDetail("thread-abc"));

		await waitFor(() => {
			expect(result.current.status).toBe("ready");
		});

		const callCountBefore = apiFetchMock.mock.calls.length;

		// Fire event for a DIFFERENT thread
		await act(async () => {
			capturedHandler?.({
				type: "thread_message_appended",
				threadId: "thread-DIFFERENT",
				messageId: "msg-99",
			});
		});

		// Should NOT re-fetch (different thread)
		await new Promise((r) => setTimeout(r, 20));
		expect(apiFetchMock.mock.calls.length).toBe(callCountBefore);
	});

	it("re-fetches on thread_resolved event", async () => {
		let capturedHandler: ((data: unknown) => void) | null = null;

		subscribeMock.mockImplementation((_channel: string, handler: (data: unknown) => void) => {
			capturedHandler = handler;
			return unsubscribeMock;
		});

		const { result } = renderHook(() => useThreadDetail("thread-abc"));

		await waitFor(() => {
			expect(result.current.status).toBe("ready");
		});

		const callCountBefore = apiFetchMock.mock.calls.length;

		await act(async () => {
			capturedHandler?.({
				type: "thread_resolved",
				threadId: "thread-abc",
			});
		});

		await waitFor(() => {
			expect(apiFetchMock.mock.calls.length).toBeGreaterThan(callCountBefore);
		});
	});
});
