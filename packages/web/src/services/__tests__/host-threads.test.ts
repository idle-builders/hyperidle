/**
 * L18 — host-threads.ts service tests.
 *
 * AC coverage:
 *  - resolveOrCreateHostThread round-trips on each host kind (bet, task, knowledge_item, artifact)
 *  - resolveOrCreateHostThread idempotency: returns existing thread id when already exists
 *  - postPlainHostMessage forwards blockId in payload when provided
 *  - postPlainHostMessage works without blockId (plain message)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { postPlainHostMessage, resolveOrCreateHostThread } from "../../services/host-threads";

const EXISTING_THREAD_ID = "thread-existing-001";
const CREATED_THREAD_ID = "thread-created-002";
const FOUNDER_ID = "u-founder";
const AGENT_ID = "agent-unassigned";

function makeThreadListResponse(threadList: Array<{ id: string }>): Response {
	return {
		ok: true,
		json: () => Promise.resolve({ threads: threadList }),
	} as unknown as Response;
}

function makeCreateThreadResponse(id: string): Response {
	return {
		ok: true,
		json: () => Promise.resolve({ thread: { id } }),
	} as unknown as Response;
}

function makePostMessageResponse(): Response {
	return {
		ok: true,
		json: () => Promise.resolve({ message: { id: "msg-001" } }),
	} as unknown as Response;
}

describe("resolveOrCreateHostThread (L18)", () => {
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchSpy = vi.fn();
		global.fetch = fetchSpy;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	for (const hostKind of ["bet", "task", "knowledge_item", "artifact"] as const) {
		it(`resolveOrCreateHostThread round-trips on host_kind='${hostKind}'`, async () => {
			fetchSpy.mockResolvedValueOnce(makeThreadListResponse([{ id: EXISTING_THREAD_ID }]));

			const result = await resolveOrCreateHostThread(
				hostKind,
				`${hostKind}-host-1`,
				FOUNDER_ID,
				AGENT_ID,
			);

			expect(result).toBe(EXISTING_THREAD_ID);
			expect(fetchSpy).toHaveBeenCalledOnce();
			const [url] = fetchSpy.mock.calls[0] as [string, RequestInit | undefined];
			expect(url).toContain(`host_kind=${hostKind}`);
			expect(url).toContain(`host_id=${hostKind}-host-1`);
		});
	}

	it("creates a new thread when none exists and returns its id", async () => {
		fetchSpy
			.mockResolvedValueOnce(makeThreadListResponse([]))
			.mockResolvedValueOnce(makeCreateThreadResponse(CREATED_THREAD_ID));

		const result = await resolveOrCreateHostThread("bet", "bet-new-1", FOUNDER_ID, AGENT_ID);

		expect(result).toBe(CREATED_THREAD_ID);
		expect(fetchSpy).toHaveBeenCalledTimes(2);
		const [, postOptions] = fetchSpy.mock.calls[1] as [string, RequestInit];
		const body = JSON.parse(postOptions.body as string) as {
			hostKind: string;
			hostId: string;
			participants: string[];
		};
		expect(body.hostKind).toBe("bet");
		expect(body.hostId).toBe("bet-new-1");
		expect(body.participants).toContain(FOUNDER_ID);
	});

	it("idempotent: returns existing thread id when GET returns >=1 thread", async () => {
		fetchSpy.mockResolvedValueOnce(makeThreadListResponse([{ id: EXISTING_THREAD_ID }]));

		const result = await resolveOrCreateHostThread("artifact", "art-1", FOUNDER_ID, AGENT_ID);

		expect(result).toBe(EXISTING_THREAD_ID);
		// Only one fetch — no POST needed
		expect(fetchSpy).toHaveBeenCalledOnce();
	});
});

describe("postPlainHostMessage (L18)", () => {
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchSpy = vi.fn();
		global.fetch = fetchSpy;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("POSTs a plain message to the correct endpoint", async () => {
		fetchSpy.mockResolvedValueOnce(makePostMessageResponse());

		const threadId = "thread-abc";
		const text = "This is a test message.";
		const clientKey = "client-key-001";

		await postPlainHostMessage(threadId, text, clientKey);

		expect(fetchSpy).toHaveBeenCalledOnce();
		const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
		expect(url).toContain(`/api/threads/${threadId}/messages`);
		expect(options.method).toBe("POST");

		const body = JSON.parse(options.body as string) as {
			type: string;
			payload: { text: string; blockId?: string };
			clientKey: string;
		};
		expect(body.type).toBe("plain");
		expect(body.payload.text).toBe(text);
		expect(body.clientKey).toBe(clientKey);
		expect(body.payload.blockId).toBeUndefined();
	});

	it("forwards blockId in payload when provided", async () => {
		fetchSpy.mockResolvedValueOnce(makePostMessageResponse());

		const threadId = "thread-xyz";
		const text = "Discussing this block";
		const clientKey = "client-key-002";
		const blockId = "block-id-abc";

		await postPlainHostMessage(threadId, text, clientKey, blockId);

		expect(fetchSpy).toHaveBeenCalledOnce();
		const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(options.body as string) as {
			type: string;
			payload: { text: string; blockId?: string };
		};
		expect(body.payload.blockId).toBe(blockId);
		expect(body.payload.text).toBe(text);
	});

	it("throws when the server returns a non-ok response", async () => {
		fetchSpy.mockResolvedValueOnce({
			ok: false,
			status: 500,
			json: () => Promise.resolve({ error: "Internal server error" }),
		} as unknown as Response);

		await expect(postPlainHostMessage("thread-fail", "some text", "key-fail")).rejects.toThrow();
	});
});
