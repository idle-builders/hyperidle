/**
 * AU21 §6 Decision L4 / §9 Increment 14d.
 *
 * `useAssistantThread` subscribes to `thread:<threadId>` (once the thread id
 * is known from the first fetch) and applies the pushed CHANGED RECORD
 * directly (`{ type: "update", topic, kind, data }` — see
 * `routes/threads.ts`), not an invalidate ping — the founder: "there is no
 * refetch … core submits the changed version." This file asserts the
 * hook's state updates from the pushed payload with ZERO follow-up fetch.
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

function pushedMessage(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		id: "msg-2",
		threadId: "thread-ast-1",
		senderId: "ast-u-founder",
		clientKey: "k2",
		type: "plain",
		payload: { text: "Hello, how can I help?" },
		deletedAt: null,
		redactedAt: null,
		resolvedAt: null,
		createdAt: "2026-04-30T12:05:00.000Z",
		...overrides,
	};
}

describe("useAssistantThread applies pushed data with zero follow-up fetch", () => {
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

	it("appends the pushed Message on thread_message_appended, with ZERO follow-up fetch", async () => {
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
				type: "update",
				topic: "thread:thread-ast-1",
				kind: "thread_message_appended",
				data: { message: pushedMessage(), senderIdentity: { name: "Assistant", isAgent: true } },
			});
		});

		await waitFor(() => {
			expect(result.current.data?.messages.some((m) => m.id === "msg-2")).toBe(true);
		});
		expect(result.current.data?.identities["ast-u-founder"]).toEqual({
			name: "Assistant",
			isAgent: true,
		});
		expect(apiFetchMock.mock.calls.length).toBe(callCountBefore);
	});

	it("does NOT apply a push for a DIFFERENT thread's topic", async () => {
		let capturedHandler: ((data: unknown) => void) | null = null;
		subscribeMock.mockImplementation((_topic: string, handler: (data: unknown) => void) => {
			capturedHandler = handler;
			return unsubscribeMock;
		});

		const { result } = renderHook(() => useAssistantThread());
		await waitFor(() => expect(result.current.status).toBe("ready"));

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
});
