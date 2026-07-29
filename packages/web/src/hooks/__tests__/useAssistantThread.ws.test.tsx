/**
 * AU21 Increment 7, Wave A (Decision E) — RED phase.
 *
 * `useAssistantThread` subscribes to `thread:<threadId>` (once the thread id
 * is known from the first fetch) and bumps `tick` (triggering a re-fetch) on
 * `thread_message_appended`/`thread_resolved`/`thread_reopened`. The server
 * now forwards a minimal invalidation envelope on this topic
 * (`{ type: "invalidate", topic, kind, id }`) instead of the full domain
 * event (`{ type, threadId, ... }`) — see `ws-broadcaster.thread-topic.test.ts`.
 * The hook must filter on `msg.kind`/`msg.id` instead of `msg.type`/
 * `msg.threadId` to keep triggering the same re-fetch it does today.
 *
 * No prior dedicated WS-behavior test file existed for this hook (verified —
 * only `AssistantOverlay` component tests exist, which mock the hook
 * entirely). This file exercises the real hook via `renderHook`, mirroring
 * `AF14-useThreadDetail-ws.test.tsx`'s mocking approach.
 *
 * Red until `useAssistantThread` filters on `msg.kind`/`msg.id` instead of
 * `msg.type`/`msg.threadId`.
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { subscribeMock, unsubscribeMock, apiFetchMock } = vi.hoisted(() => {
	const unsubscribeMock = vi.fn();
	const subscribeMock = vi.fn().mockReturnValue(unsubscribeMock);
	const apiFetchMock = vi.fn();
	return { subscribeMock, unsubscribeMock, apiFetchMock };
});

// Override the global no-op ws-client mock with a captureable spy.
vi.mock("../../services/ws-client.js", () => ({
	getWsClient: () => ({
		subscribe: subscribeMock,
	}),
}));

vi.mock("../../services/api-fetch.js", () => ({
	apiFetch: apiFetchMock,
}));

import { useAssistantThread } from "../useAssistantThread.js";

function makeAssistantThreadResponse() {
	return {
		thread: {
			id: "thread-ast-1",
			hostKind: "user",
			hostId: "u-founder",
			initiatorId: "u-founder",
			participants: ["u-founder", "ast-u-founder"],
			pinned: false,
			resolvedAt: null,
			lastActiveAt: "2026-04-30T12:00:00.000Z",
			createdAt: "2026-04-30T12:00:00.000Z",
		},
		messages: [
			{
				id: "msg-1",
				threadId: "thread-ast-1",
				senderId: "u-founder",
				clientKey: "k1",
				type: "plain",
				payload: { text: "Hi" },
				deletedAt: null,
				redactedAt: null,
				resolvedAt: null,
				createdAt: "2026-04-30T12:00:00.000Z",
			},
		],
		identities: {},
	};
}

describe("AU21 Increment 7 — useAssistantThread reacts to the minimal invalidation envelope", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		unsubscribeMock.mockReset();
		subscribeMock.mockReturnValue(unsubscribeMock);
		apiFetchMock.mockResolvedValue({
			ok: true,
			status: 200,
			json: () => Promise.resolve(makeAssistantThreadResponse()),
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("subscribes to thread:<threadId> once the thread id is known", async () => {
		const { result } = renderHook(() => useAssistantThread());

		await waitFor(() => expect(result.current.status).toBe("ready"));

		expect(subscribeMock).toHaveBeenCalledWith("thread:thread-ast-1", expect.any(Function));
	});

	it("re-fetches on { type: 'invalidate', topic, kind: 'thread_message_appended', id }", async () => {
		let capturedHandler: ((data: unknown) => void) | null = null;
		subscribeMock.mockImplementation((_topic: string, handler: (data: unknown) => void) => {
			capturedHandler = handler;
			return unsubscribeMock;
		});

		const { result } = renderHook(() => useAssistantThread());
		await waitFor(() => expect(result.current.status).toBe("ready"));

		const callCountBefore = apiFetchMock.mock.calls.length;

		await act(async () => {
			capturedHandler?.({
				type: "invalidate",
				topic: "thread:thread-ast-1",
				kind: "thread_message_appended",
				id: "thread-ast-1",
			});
		});

		await waitFor(() => {
			expect(apiFetchMock.mock.calls.length).toBeGreaterThan(callCountBefore);
		});
	});

	it("does NOT re-fetch for an invalidation envelope of a DIFFERENT thread id", async () => {
		let capturedHandler: ((data: unknown) => void) | null = null;
		subscribeMock.mockImplementation((_topic: string, handler: (data: unknown) => void) => {
			capturedHandler = handler;
			return unsubscribeMock;
		});

		const { result } = renderHook(() => useAssistantThread());
		await waitFor(() => expect(result.current.status).toBe("ready"));

		const callCountBefore = apiFetchMock.mock.calls.length;

		await act(async () => {
			capturedHandler?.({
				type: "invalidate",
				topic: "thread:thread-DIFFERENT",
				kind: "thread_message_appended",
				id: "thread-DIFFERENT",
			});
		});

		await new Promise((r) => setTimeout(r, 20));
		expect(apiFetchMock.mock.calls.length).toBe(callCountBefore);
	});
});
