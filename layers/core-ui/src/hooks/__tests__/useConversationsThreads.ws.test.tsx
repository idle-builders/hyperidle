/**
 * AU21 §6 Decision L4 / §9 Increment 14d.
 *
 * `useConversationsThreads` subscribes to the "conversations" topic and
 * applies the pushed `ThreadListRow` directly on `thread_created` — the
 * server now pushes the changed record (`{ type: "update", topic:
 * "conversations", kind: "thread_created", data }`), not an invalidate ping
 * (founder: "there is no refetch … core submits the changed version"). The
 * hook must apply `data` to its own state with ZERO follow-up fetch.
 *
 * Mirrors the mocking approach in `AF14-useThreadDetail-ws.test.tsx`: the
 * global no-op `ws-client` mock (test-setup.ts) is overridden with a
 * captureable spy so we can fire a simulated WS message at the subscribed
 * handler directly. WS transport itself stays untested here (covered by
 * `ws-client.push.test.ts`).
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
				title: "Existing thread",
			},
		],
		nextCursor: null,
	};
}

function pushedRow(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		id: "t-new",
		hostKind: "task",
		hostId: "host-2",
		initiatorId: "u-founder",
		participants: ["u-founder", "agent-2"],
		pinned: false,
		resolvedAt: null,
		lastActiveAt: "2026-04-30T13:00:00.000Z",
		createdAt: "2026-04-30T13:00:00.000Z",
		hasUnresolvedReview: false,
		title: "New thread",
		...overrides,
	};
}

describe("useConversationsThreads applies the pushed ThreadListRow with zero follow-up fetch", () => {
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

	it("inserts the pushed row into state with ZERO follow-up fetch", async () => {
		let capturedHandler: ((data: unknown) => void) | null = null;
		subscribeMock.mockImplementation((_topic: string, handler: (data: unknown) => void) => {
			capturedHandler = handler;
			return unsubscribeMock;
		});

		const { result } = renderHook(() => useConversationsThreads("u-founder"));
		await waitFor(() => expect(result.current.status).toBe("ready"));
		expect(result.current.threads).toHaveLength(1);

		const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
		const callCountBefore = fetchMock.mock.calls.length;

		await act(async () => {
			capturedHandler?.({
				type: "update",
				topic: "conversations",
				kind: "thread_created",
				data: pushedRow(),
			});
		});

		await waitFor(() => {
			expect(result.current.threads.some((t) => t.id === "t-new")).toBe(true);
		});
		// No follow-up network read — the pushed row was applied directly.
		expect(fetchMock.mock.calls.length).toBe(callCountBefore);
	});

	it("orders the pushed row by lastActiveAt (newest first)", async () => {
		let capturedHandler: ((data: unknown) => void) | null = null;
		subscribeMock.mockImplementation((_topic: string, handler: (data: unknown) => void) => {
			capturedHandler = handler;
			return unsubscribeMock;
		});

		const { result } = renderHook(() => useConversationsThreads("u-founder"));
		await waitFor(() => expect(result.current.status).toBe("ready"));

		await act(async () => {
			capturedHandler?.({
				type: "update",
				topic: "conversations",
				kind: "thread_created",
				data: pushedRow(),
			});
		});

		await waitFor(() => {
			expect(result.current.threads[0]?.id).toBe("t-new");
		});
	});

	it("drops a pushed row whose participants do not include this participant", async () => {
		let capturedHandler: ((data: unknown) => void) | null = null;
		subscribeMock.mockImplementation((_topic: string, handler: (data: unknown) => void) => {
			capturedHandler = handler;
			return unsubscribeMock;
		});

		const { result } = renderHook(() => useConversationsThreads("u-founder"));
		await waitFor(() => expect(result.current.status).toBe("ready"));

		await act(async () => {
			capturedHandler?.({
				type: "update",
				topic: "conversations",
				kind: "thread_created",
				data: pushedRow({ participants: ["agent-2", "agent-3"] }),
			});
		});

		await new Promise((r) => setTimeout(r, 20));
		expect(result.current.threads.some((t) => t.id === "t-new")).toBe(false);
	});

	/**
	 * @lore BA2: an agent filing a review appends a message to a thread the human
	 * ALREADY has. Nothing about that push announces a new thread, and the hook
	 * used to accept `thread_created` only, then skip any id it already held. So
	 * the row never moved, its time never changed, and its blocking flag never
	 * flipped — the review was invisible until the app was restarted.
	 */
	it("applies a message append to a thread already in the list", async () => {
		let capturedHandler: ((data: unknown) => void) | null = null;
		subscribeMock.mockImplementation((_topic: string, handler: (data: unknown) => void) => {
			capturedHandler = handler;
			return unsubscribeMock;
		});

		const { result } = renderHook(() => useConversationsThreads("u-founder"));
		await waitFor(() => expect(result.current.status).toBe("ready"));
		expect(result.current.threads[0]?.status).not.toBe("behind");

		await act(async () => {
			capturedHandler?.({
				type: "update",
				topic: "conversations",
				kind: "thread_message_appended",
				data: pushedRow({
					id: "t1",
					hostId: "host-1",
					participants: ["u-founder", "agent-1"],
					title: "Existing thread",
					hasUnresolvedReview: true,
					lastActiveAt: "2026-04-30T14:00:00.000Z",
				}),
			});
		});

		await waitFor(() => {
			expect(
				result.current.threads.find((t) => t.id === "t1")?.status,
				"the human is now the one holding this up and the list has to say so",
			).toBe("behind");
		});
		// Replaced in place, not duplicated.
		expect(result.current.threads.filter((t) => t.id === "t1")).toHaveLength(1);
	});

	it("ignores a push envelope of a different kind", async () => {
		let capturedHandler: ((data: unknown) => void) | null = null;
		subscribeMock.mockImplementation((_topic: string, handler: (data: unknown) => void) => {
			capturedHandler = handler;
			return unsubscribeMock;
		});

		const { result } = renderHook(() => useConversationsThreads("u-founder"));
		await waitFor(() => expect(result.current.status).toBe("ready"));

		await act(async () => {
			capturedHandler?.({
				type: "update",
				topic: "conversations",
				kind: "task_state_changed",
				data: { taskId: "task-1", toState: "accepted" },
			});
		});

		await new Promise((r) => setTimeout(r, 20));
		expect(result.current.threads).toHaveLength(1);
	});

	it("is idempotent — a duplicate push of an already-present row does not double-insert", async () => {
		let capturedHandler: ((data: unknown) => void) | null = null;
		subscribeMock.mockImplementation((_topic: string, handler: (data: unknown) => void) => {
			capturedHandler = handler;
			return unsubscribeMock;
		});

		const { result } = renderHook(() => useConversationsThreads("u-founder"));
		await waitFor(() => expect(result.current.status).toBe("ready"));

		const push = () =>
			act(async () => {
				capturedHandler?.({
					type: "update",
					topic: "conversations",
					kind: "thread_created",
					data: pushedRow(),
				});
			});
		await push();
		await push();

		await waitFor(() => {
			expect(result.current.threads.filter((t) => t.id === "t-new")).toHaveLength(1);
		});
	});
});
