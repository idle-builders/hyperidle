/**
 * L15 — task-threads.service tests.
 *
 * Cases:
 * (a) resolveOrCreateTaskThread returns existing thread id when GET returns ≥1 thread
 * (b) resolveOrCreateTaskThread creates and returns id when GET returns 0 threads
 * (c) postRequestMessage POSTs the right body (threadId, text, clientKey)
 * (d) idempotent retry — same clientKey, second call treated as success (200)
 * (e) input-trust boundary: note with <script>alert(1)</script> is sent as literal string (no client-side stripping)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { postRequestMessage, resolveOrCreateTaskThread } from "../services/task-threads";

const EXISTING_THREAD_ID = "thread-existing-001";
const CREATED_THREAD_ID = "thread-created-002";
const TASK_ID = "task-xyz";
const FOUNDER_ID = "u-founder";

function makeThreadListResponse(threads: Array<{ id: string }>): Response {
	return {
		ok: true,
		json: () => Promise.resolve({ threads }),
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

describe("resolveOrCreateTaskThread (L15)", () => {
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchSpy = vi.fn();
		global.fetch = fetchSpy as unknown as typeof fetch;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("(a) returns existing thread id when GET returns ≥1 thread", async () => {
		fetchSpy.mockResolvedValueOnce(makeThreadListResponse([{ id: EXISTING_THREAD_ID }]));

		const result = await resolveOrCreateTaskThread(TASK_ID, FOUNDER_ID, "agent-001");

		expect(result).toBe(EXISTING_THREAD_ID);
		expect(fetchSpy).toHaveBeenCalledOnce();
		// Should call GET, not POST
		const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit | undefined];
		expect(url).toContain("host_kind=task");
		expect(url).toContain(`host_id=${TASK_ID}`);
		expect(options?.method ?? "GET").toBe("GET");
	});

	it("(a) returns first thread id when GET returns multiple threads", async () => {
		fetchSpy.mockResolvedValueOnce(
			makeThreadListResponse([{ id: EXISTING_THREAD_ID }, { id: "thread-second" }]),
		);

		const result = await resolveOrCreateTaskThread(TASK_ID, FOUNDER_ID, "agent-001");

		expect(result).toBe(EXISTING_THREAD_ID);
		expect(fetchSpy).toHaveBeenCalledOnce();
	});

	it("(b) creates a new thread and returns its id when GET returns 0 threads", async () => {
		fetchSpy
			.mockResolvedValueOnce(makeThreadListResponse([]))
			.mockResolvedValueOnce(makeCreateThreadResponse(CREATED_THREAD_ID));

		const result = await resolveOrCreateTaskThread(TASK_ID, FOUNDER_ID, "agent-001");

		expect(result).toBe(CREATED_THREAD_ID);
		expect(fetchSpy).toHaveBeenCalledTimes(2);

		// Second call should be POST /api/threads
		const [postUrl, postOptions] = fetchSpy.mock.calls[1] as [string, RequestInit];
		expect(postUrl).toContain("/api/threads");
		expect(postOptions.method).toBe("POST");

		const body = JSON.parse(postOptions.body as string) as Record<string, unknown>;
		expect(body.hostKind).toBe("task");
		expect(body.hostId).toBe(TASK_ID);
		expect(Array.isArray(body.participants)).toBe(true);
	});

	it("(b) POST body includes hostKind, hostId, participants, and initialMessage", async () => {
		fetchSpy
			.mockResolvedValueOnce(makeThreadListResponse([]))
			.mockResolvedValueOnce(makeCreateThreadResponse(CREATED_THREAD_ID));

		await resolveOrCreateTaskThread(TASK_ID, FOUNDER_ID, "agent-001");

		const [, postOptions] = fetchSpy.mock.calls[1] as [string, RequestInit];
		const body = JSON.parse(postOptions.body as string) as {
			hostKind: string;
			hostId: string;
			participants: string[];
			initialMessage: { type: string; payload: { text: string }; clientKey: string };
		};
		expect(body.hostKind).toBe("task");
		expect(body.hostId).toBe(TASK_ID);
		expect(body.participants).toContain(FOUNDER_ID);
		expect(body.initialMessage.type).toBe("plain");
		expect(typeof body.initialMessage.clientKey).toBe("string");
	});

	it("M3 D2: PLACEHOLDER_AGENT_PARTICIPANT_ID is NOT exported from task-threads", async () => {
		// @ts-expect-error — testing deleted export
		const { PLACEHOLDER_AGENT_PARTICIPANT_ID } = await import("../services/task-threads");
		expect(PLACEHOLDER_AGENT_PARTICIPANT_ID).toBeUndefined();
	});
});

describe("postRequestMessage (L15)", () => {
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchSpy = vi.fn();
		global.fetch = fetchSpy as unknown as typeof fetch;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("(c) POSTs the correct body to the right endpoint", async () => {
		fetchSpy.mockResolvedValueOnce(makePostMessageResponse());

		const threadId = "thread-abc";
		const text = "Request: move to BLOCKED.";
		const clientKey = "client-key-123";

		await postRequestMessage(threadId, text, clientKey);

		expect(fetchSpy).toHaveBeenCalledOnce();
		const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
		expect(url).toContain(`/api/threads/${threadId}/messages`);
		expect(options.method).toBe("POST");

		const body = JSON.parse(options.body as string) as {
			type: string;
			payload: { text: string };
			clientKey: string;
		};
		expect(body.type).toBe("plain");
		expect(body.payload.text).toBe(text);
		expect(body.clientKey).toBe(clientKey);
	});

	it("(d) idempotent retry: same clientKey on second call returns successfully (200)", async () => {
		// Both calls succeed (server de-dupes on clientKey conflict and returns 200)
		fetchSpy
			.mockResolvedValueOnce(makePostMessageResponse())
			.mockResolvedValueOnce(makePostMessageResponse());

		const threadId = "thread-abc";
		const text = "Request: move to BLOCKED.";
		const clientKey = "stable-client-key";

		// First call
		await postRequestMessage(threadId, text, clientKey);
		// Second call (retry) — same clientKey
		await postRequestMessage(threadId, text, clientKey);

		expect(fetchSpy).toHaveBeenCalledTimes(2);
		// Both calls use the same clientKey
		const [, opts1] = fetchSpy.mock.calls[0] as [string, RequestInit];
		const [, opts2] = fetchSpy.mock.calls[1] as [string, RequestInit];
		const body1 = JSON.parse(opts1.body as string) as { clientKey: string };
		const body2 = JSON.parse(opts2.body as string) as { clientKey: string };
		expect(body1.clientKey).toBe(clientKey);
		expect(body2.clientKey).toBe(clientKey);
	});

	it("(e) input-trust: note with <script>alert(1)</script> is sent verbatim — no client-side stripping", async () => {
		fetchSpy.mockResolvedValueOnce(makePostMessageResponse());

		const xssText = "Request: move to BLOCKED. <script>alert(1)</script>";
		await postRequestMessage("thread-abc", xssText, "key-001");

		const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(options.body as string) as {
			payload: { text: string };
		};
		// Rendering layer owns escaping; client sends the literal string.
		expect(body.payload.text).toBe(xssText);
		expect(body.payload.text).toContain("<script>");
	});

	it("throws when the server returns a non-ok response", async () => {
		fetchSpy.mockResolvedValueOnce({
			ok: false,
			status: 500,
			json: () => Promise.resolve({ error: "Internal server error" }),
		} as unknown as Response);

		await expect(
			postRequestMessage("thread-abc", "Request: stop (kill).", "key-002"),
		).rejects.toThrow();
	});
});
