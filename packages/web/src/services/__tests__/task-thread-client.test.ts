/**
 * L15 — Thin client wrapper around the existing /api/threads endpoints.
 * Server-side validation is already covered by L1; here we assert the
 * fetch shape (URL, body, idempotency key, response parsing) and the
 * cross-cutting concerns added by review (TOCTOU coalescing, typed
 * errors, defensive id validation).
 */
import { describe, expect, it, vi } from "vitest";
import {
	buildRequestStateText,
	createTaskThreadClient,
	TaskThreadHttpError,
} from "../task-thread-client";

describe("task-thread-client", () => {
	describe("buildRequestStateText", () => {
		it("produces the locked prose for each requestable state", () => {
			expect(buildRequestStateText("done")).toBe("Requesting state change to done.");
			expect(buildRequestStateText("blocked")).toBe("Requesting state change to blocked.");
			expect(buildRequestStateText("hold")).toBe("Requesting state change to hold.");
			expect(buildRequestStateText("killed")).toBe("Requesting state change to killed.");
			expect(buildRequestStateText("in_progress")).toBe("Requesting state change to in_progress.");
		});
	});

	describe("findOrCreateTaskThread", () => {
		it("returns an existing thread when the GET response yields one", async () => {
			const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
				const url = String(input);
				expect(url).toContain("/api/threads");
				expect(url).toContain("host_kind=task");
				expect(url).toContain("host_id=t-1");
				return new Response(JSON.stringify({ threads: [{ id: "th-existing" }] }), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			});
			const client = createTaskThreadClient(fetchMock as unknown as typeof globalThis.fetch);
			const handle = await client.findOrCreateTaskThread("t-1");
			expect(handle).toEqual({ threadId: "th-existing" });
			expect(fetchMock).toHaveBeenCalledTimes(1);
		});

		it("creates a new thread via POST with required participants + initialMessage", async () => {
			let createdBody: Record<string, unknown> | null = null;
			const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				const method = init?.method ?? "GET";
				if (method === "GET") {
					return new Response(JSON.stringify({ threads: [] }), {
						status: 200,
						headers: { "content-type": "application/json" },
					});
				}
				expect(url).toBe("/api/threads");
				expect(method).toBe("POST");
				createdBody = JSON.parse(String(init?.body));
				// Server returns { thread, messages } per routes/threads.ts:371-377.
				return new Response(JSON.stringify({ thread: { id: "th-new" }, messages: [] }), {
					status: 201,
					headers: { "content-type": "application/json" },
				});
			});
			const client = createTaskThreadClient(fetchMock as unknown as typeof globalThis.fetch);
			const handle = await client.findOrCreateTaskThread("t-1");
			expect(handle).toEqual({ threadId: "th-new" });
			expect(createdBody).toMatchObject({
				hostKind: "task",
				hostId: "t-1",
				participants: ["u-founder"],
				initialMessage: {
					type: "plain",
					payload: { text: "Thread opened from Team Board" },
				},
			});
			const initialMessage = (createdBody as { initialMessage: { clientKey: string } })
				.initialMessage;
			expect(initialMessage.clientKey).toMatch(/^[A-Za-z0-9_\-:.]{8,128}$/);
		});

		it("uses the configured initiatorId in participants[]", async () => {
			let body: Record<string, unknown> | null = null;
			const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				if ((init?.method ?? "GET") === "GET") {
					return new Response(JSON.stringify({ threads: [] }), { status: 200 });
				}
				body = JSON.parse(String(init?.body));
				return new Response(JSON.stringify({ thread: { id: "th-new" }, messages: [] }), {
					status: 201,
				});
			});
			const client = createTaskThreadClient(fetchMock as unknown as typeof globalThis.fetch, {
				initiatorId: "u-other",
			});
			await client.findOrCreateTaskThread("t-1");
			expect(body).toMatchObject({ participants: ["u-other"] });
		});

		it("coalesces concurrent calls for the same task (TOCTOU guard)", async () => {
			let getCount = 0;
			let postCount = 0;
			const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
				const method = init?.method ?? "GET";
				if (method === "GET") {
					getCount++;
					await new Promise((r) => setTimeout(r, 5));
					return new Response(JSON.stringify({ threads: [] }), { status: 200 });
				}
				postCount++;
				return new Response(JSON.stringify({ thread: { id: "th-coalesced" }, messages: [] }), {
					status: 201,
				});
			});
			const client = createTaskThreadClient(fetchMock as unknown as typeof globalThis.fetch);
			const [a, b, c] = await Promise.all([
				client.findOrCreateTaskThread("t-1"),
				client.findOrCreateTaskThread("t-1"),
				client.findOrCreateTaskThread("t-1"),
			]);
			expect(a.threadId).toBe("th-coalesced");
			expect(b.threadId).toBe("th-coalesced");
			expect(c.threadId).toBe("th-coalesced");
			expect(getCount).toBe(1);
			expect(postCount).toBe(1);
		});

		it("throws TaskThreadHttpError with userMessage on 5xx", async () => {
			const fetchMock = vi.fn(
				async () => new Response(JSON.stringify({ error: "boom" }), { status: 503 }),
			);
			const client = createTaskThreadClient(fetchMock as unknown as typeof globalThis.fetch);
			await expect(client.findOrCreateTaskThread("t-1")).rejects.toThrow(TaskThreadHttpError);
			try {
				await client.findOrCreateTaskThread("t-1");
				expect.unreachable();
			} catch (cause) {
				expect(cause).toBeInstanceOf(TaskThreadHttpError);
				expect((cause as TaskThreadHttpError).status).toBe(503);
				expect((cause as TaskThreadHttpError).userMessage).toMatch(/server is unavailable/i);
			}
		});

		it("rejects malformed thread ids returned from the server", async () => {
			const fetchMock = vi.fn(
				async () =>
					new Response(JSON.stringify({ threads: [{ id: "<bad id>" }] }), { status: 200 }),
			);
			const client = createTaskThreadClient(fetchMock as unknown as typeof globalThis.fetch);
			await expect(client.findOrCreateTaskThread("t-1")).rejects.toThrow(TaskThreadHttpError);
		});
	});

	describe("postPlainMessage", () => {
		it("POSTs a plain message with the supplied clientKey", async () => {
			let recordedUrl: string | null = null;
			let recordedBody: Record<string, unknown> | null = null;
			const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				recordedUrl = String(input);
				recordedBody = JSON.parse(String(init?.body));
				return new Response(JSON.stringify({}), { status: 200 });
			});
			const client = createTaskThreadClient(fetchMock as unknown as typeof globalThis.fetch);
			await client.postPlainMessage("th-existing", "hello", "ck-12345678");
			expect(recordedUrl).toBe("/api/threads/th-existing/messages");
			expect(recordedBody).toEqual({
				type: "plain",
				payload: { text: "hello" },
				clientKey: "ck-12345678",
			});
		});

		it("rejects malformed thread ids before calling fetch", async () => {
			const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
			const client = createTaskThreadClient(fetchMock as unknown as typeof globalThis.fetch);
			await expect(client.postPlainMessage("not a valid id!", "hi", "ck-12345678")).rejects.toThrow(
				TaskThreadHttpError,
			);
			expect(fetchMock).not.toHaveBeenCalled();
		});

		it("throws TaskThreadHttpError when the server returns a non-2xx status", async () => {
			const fetchMock = vi.fn(async () => new Response("{}", { status: 500 }));
			const client = createTaskThreadClient(fetchMock as unknown as typeof globalThis.fetch);
			await expect(client.postPlainMessage("th-existing", "hi", "ck-12345678")).rejects.toThrow(
				TaskThreadHttpError,
			);
		});
	});
});
