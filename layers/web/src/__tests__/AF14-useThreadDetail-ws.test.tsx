/**
 * AF14 AC3 — Reply in open thread appears without manual reload.
 *
 * AU21 §6 Decision L4 / §9 Increment 14d: the WS subscription effect
 * subscribes to `thread:<threadId>` and applies the pushed CHANGED RECORD
 * directly (`{ type: "update", topic, kind, data }` — see
 * `routes/threads.ts`), not an invalidate ping. The founder: "there is no
 * refetch … core submits the changed version." This file asserts the
 * hook's state updates from the pushed payload with ZERO follow-up fetch.
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

function pushedMessage(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		id: "msg-2",
		threadId: "thread-abc",
		senderId: "agent-1",
		clientKey: "k2",
		type: "plain",
		payload: { text: "Reply" },
		deletedAt: null,
		redactedAt: null,
		resolvedAt: null,
		createdAt: "2026-06-11T10:05:00.000Z",
		...overrides,
	};
}

describe("AF14 AC3 — useThreadDetail applies pushed data with zero follow-up fetch", () => {
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
		expect(subscribeMock).toHaveBeenCalledWith("thread:thread-abc", expect.any(Function));
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

	it("appends the pushed Message on thread_message_appended, with ZERO follow-up fetch", async () => {
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
				type: "update",
				topic: "thread:thread-abc",
				kind: "thread_message_appended",
				data: { message: pushedMessage(), senderIdentity: { name: "Agent One", isAgent: true } },
			});
		});

		await waitFor(() => {
			expect(result.current.data?.messages.some((m) => m.id === "msg-2")).toBe(true);
		});
		expect(result.current.data?.identities["agent-1"]).toEqual({
			name: "Agent One",
			isAgent: true,
		});
		// No follow-up network read — the pushed message was applied directly.
		expect(apiFetchMock.mock.calls.length).toBe(callCountBefore);
	});

	it("does NOT apply a push for a DIFFERENT thread's topic", async () => {
		let capturedHandler: ((data: unknown) => void) | null = null;

		subscribeMock.mockImplementation((_channel: string, handler: (data: unknown) => void) => {
			capturedHandler = handler;
			return unsubscribeMock;
		});

		const { result } = renderHook(() => useThreadDetail("thread-abc"));

		await waitFor(() => {
			expect(result.current.status).toBe("ready");
		});

		const messageCountBefore = result.current.data?.messages.length;

		await act(async () => {
			capturedHandler?.({
				type: "update",
				topic: "thread:thread-DIFFERENT",
				kind: "thread_message_appended",
				data: { message: pushedMessage({ threadId: "thread-DIFFERENT" }) },
			});
		});

		await new Promise((r) => setTimeout(r, 20));
		expect(result.current.data?.messages.length).toBe(messageCountBefore);
	});

	it("patches thread.resolvedAt on thread_resolved, with ZERO follow-up fetch", async () => {
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
				type: "update",
				topic: "thread:thread-abc",
				kind: "thread_resolved",
				data: { resolvedAt: "2026-06-11T10:10:00.000Z" },
			});
		});

		await waitFor(() => {
			expect(result.current.data?.thread.resolvedAt).toBe("2026-06-11T10:10:00.000Z");
		});
		expect(apiFetchMock.mock.calls.length).toBe(callCountBefore);
	});

	it("is idempotent — a duplicate push of an already-present message does not double-append", async () => {
		let capturedHandler: ((data: unknown) => void) | null = null;

		subscribeMock.mockImplementation((_channel: string, handler: (data: unknown) => void) => {
			capturedHandler = handler;
			return unsubscribeMock;
		});

		const { result } = renderHook(() => useThreadDetail("thread-abc"));

		await waitFor(() => {
			expect(result.current.status).toBe("ready");
		});

		const push = () =>
			act(async () => {
				capturedHandler?.({
					type: "update",
					topic: "thread:thread-abc",
					kind: "thread_message_appended",
					data: { message: pushedMessage() },
				});
			});
		await push();
		await push();

		await waitFor(() => {
			expect(result.current.data?.messages.filter((m) => m.id === "msg-2")).toHaveLength(1);
		});
	});
});
