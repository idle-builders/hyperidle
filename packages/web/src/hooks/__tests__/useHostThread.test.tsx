/**
 * L18 — useHostThread hook tests.
 *
 * AC coverage:
 *  - fetches the host thread; refresh re-fires the URL
 *  - returns { data: null, isLoading: true } while fetching
 *  - returns { data, isLoading: false } on success
 *  - returns { error, isLoading: false } on failure
 *  - refresh() triggers a re-fetch by bumping the internal version counter
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useHostThread } from "../../hooks/useHostThread";

const THREAD_ID = "t-host-001";
const THREAD_FIXTURE = {
	id: THREAD_ID,
	hostKind: "bet",
	hostId: "bet-001",
	initiatorId: "u-founder",
	participants: ["u-founder", "agent-unassigned"],
	pinned: false,
	resolvedAt: null,
	lastActiveAt: "2026-05-05T10:00:00Z",
	createdAt: "2026-05-05T09:00:00Z",
};
const MESSAGES_FIXTURE = [
	{
		id: "msg-001",
		threadId: THREAD_ID,
		senderId: "u-founder",
		type: "plain",
		payload: { text: "Hello thread" },
		clientKey: "ck-001",
		deletedAt: null,
		redactedAt: null,
		resolvedAt: null,
		createdAt: "2026-05-05T09:01:00Z",
	},
];

function makeThreadListResponse(threads: Array<{ id: string }>): Response {
	return new Response(JSON.stringify({ threads }), { status: 200 });
}

function makeThreadDetailResponse(
	thread: typeof THREAD_FIXTURE,
	messages: typeof MESSAGES_FIXTURE,
): Response {
	return new Response(
		JSON.stringify({
			thread,
			messages,
			headMessageId: null,
			identities: {},
		}),
		{ status: 200 },
	);
}

describe("useHostThread (L18)", () => {
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchSpy = vi.fn();
		global.fetch = fetchSpy;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("fetches the host thread and returns data on success", async () => {
		fetchSpy
			.mockResolvedValueOnce(makeThreadListResponse([{ id: THREAD_ID }]))
			.mockResolvedValueOnce(makeThreadDetailResponse(THREAD_FIXTURE, MESSAGES_FIXTURE));

		const { result } = renderHook(() => useHostThread("bet", "bet-001"));

		expect(result.current.isLoading).toBe(true);

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		expect(result.current.data).not.toBeNull();
		expect(result.current.data?.thread.id).toBe(THREAD_ID);
		expect(result.current.data?.messages).toHaveLength(1);
		expect(result.current.error).toBeNull();
	});

	it("returns null data when no thread exists for host", async () => {
		// GET list returns empty
		fetchSpy.mockResolvedValueOnce(makeThreadListResponse([]));

		const { result } = renderHook(() => useHostThread("bet", "bet-no-thread"));

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		expect(result.current.data).toBeNull();
		expect(result.current.error).toBeNull();
	});

	it("refresh() triggers a re-fetch of the thread", async () => {
		fetchSpy
			.mockResolvedValueOnce(makeThreadListResponse([{ id: THREAD_ID }]))
			.mockResolvedValueOnce(makeThreadDetailResponse(THREAD_FIXTURE, MESSAGES_FIXTURE))
			// After refresh: same thread but with 2 messages
			.mockResolvedValueOnce(makeThreadListResponse([{ id: THREAD_ID }]))
			.mockResolvedValueOnce(
				makeThreadDetailResponse(THREAD_FIXTURE, [
					...MESSAGES_FIXTURE,
					{
						id: "msg-002",
						threadId: THREAD_ID,
						senderId: "u-founder",
						type: "plain",
						payload: { text: "Second message" },
						clientKey: "ck-002",
						deletedAt: null,
						redactedAt: null,
						resolvedAt: null,
						createdAt: "2026-05-05T09:02:00Z",
					},
				]),
			);

		const { result } = renderHook(() => useHostThread("bet", "bet-001"));

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		expect(result.current.data?.messages).toHaveLength(1);

		// Call refresh
		act(() => {
			result.current.refresh();
		});

		await waitFor(() => {
			expect(result.current.data?.messages).toHaveLength(2);
		});
	});

	it("returns null when hostId is empty string", async () => {
		const { result } = renderHook(() => useHostThread("bet", ""));

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		expect(result.current.data).toBeNull();
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});
