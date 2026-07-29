/**
 * AU21 Increment 7, Wave A (Decision E) — RED phase.
 *
 * `useConversationsThreads` subscribes to the "conversations" topic and bumps
 * `tick` (triggering a re-fetch) when it sees a `thread_created` event. The
 * server now forwards a minimal invalidation envelope for this topic
 * (`{ type: "invalidate", topic: "conversations", kind: "thread_created" }`)
 * instead of the full domain event (`{ type: "thread_created", ... }`) — see
 * `ws-broadcaster.thread-topic.test.ts`. The hook must filter on `msg.kind`
 * instead of `msg.type` to keep triggering the same re-fetch it does today.
 *
 * Mirrors the mocking approach in `AF14-useThreadDetail-ws.test.tsx`: the
 * global no-op `ws-client` mock (test-setup.ts) is overridden with a
 * captureable spy so we can fire a simulated WS message at the subscribed
 * handler directly. WS transport itself stays untested here (covered by
 * `ws-client.invalidation.test.ts`).
 *
 * Red until `useConversationsThreads` checks `msg.type === "invalidate" &&
 * msg.kind === "thread_created"` instead of `msg.type === "thread_created"`.
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { subscribeMock, unsubscribeMock } = vi.hoisted(() => {
	const unsubscribeMock = vi.fn();
	const subscribeMock = vi.fn().mockReturnValue(unsubscribeMock);
	return { subscribeMock, unsubscribeMock };
});

// Override the global no-op ws-client mock with a captureable spy.
vi.mock("../../services/ws-client.js", () => ({
	getWsClient: () => ({
		subscribe: subscribeMock,
	}),
}));

import { useConversationsThreads } from "../useConversationsThreads.js";

function makeThreadsResponse() {
	return {
		threads: [
			{
				id: "t1",
				hostKind: "task",
				hostId: "host-1",
				initiatorId: "u-founder",
				participants: ["u-founder", "agent-1"],
				pinned: false,
				resolvedAt: null,
				lastActiveAt: "2026-04-30T12:00:00.000Z",
				createdAt: "2026-04-30T12:00:00.000Z",
				hasUnresolvedReview: false,
			},
		],
		nextCursor: null,
	};
}

describe("useConversationsThreads reacts to the minimal invalidation envelope", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		subscribeMock.mockClear();
		unsubscribeMock.mockClear();
		subscribeMock.mockReturnValue(unsubscribeMock);
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(makeThreadsResponse()),
		}) as unknown as typeof fetch;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("re-fetches when the server sends { type: 'invalidate', topic: 'conversations', kind: 'thread_created' }", async () => {
		let capturedHandler: ((data: unknown) => void) | null = null;
		subscribeMock.mockImplementation((_topic: string, handler: (data: unknown) => void) => {
			capturedHandler = handler;
			return unsubscribeMock;
		});

		const { result } = renderHook(() => useConversationsThreads("u-founder"));
		await waitFor(() => expect(result.current.status).toBe("ready"));

		const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
		const callCountBefore = fetchMock.mock.calls.length;

		await act(async () => {
			capturedHandler?.({ type: "invalidate", topic: "conversations", kind: "thread_created" });
		});

		await waitFor(() => {
			expect(fetchMock.mock.calls.length).toBeGreaterThan(callCountBefore);
		});
	});

	it("does NOT re-fetch for an invalidation envelope of a different kind", async () => {
		let capturedHandler: ((data: unknown) => void) | null = null;
		subscribeMock.mockImplementation((_topic: string, handler: (data: unknown) => void) => {
			capturedHandler = handler;
			return unsubscribeMock;
		});

		const { result } = renderHook(() => useConversationsThreads("u-founder"));
		await waitFor(() => expect(result.current.status).toBe("ready"));

		const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
		const callCountBefore = fetchMock.mock.calls.length;

		await act(async () => {
			capturedHandler?.({ type: "invalidate", topic: "conversations", kind: "task_state_changed" });
		});

		await new Promise((r) => setTimeout(r, 20));
		expect(fetchMock.mock.calls.length).toBe(callCountBefore);
	});
});
