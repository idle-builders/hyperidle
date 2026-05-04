/**
 * L15 — Thin client wrapper around the existing /api/threads endpoints.
 * Server-side validation is already covered by L1; here we only assert the
 * fetch shape (URL, body, idempotency key).
 */
import { describe, expect, it, vi } from "vitest";
import {
	buildRequestStateText,
	createTaskThreadClient,
} from "../task-thread-client";

describe("task-thread-client", () => {
	describe("buildRequestStateText", () => {
		it("produces the locked prose for each requestable state", () => {
			expect(buildRequestStateText("done")).toBe("Requesting state change to done.");
			expect(buildRequestStateText("blocked")).toBe("Requesting state change to blocked.");
			expect(buildRequestStateText("hold")).toBe("Requesting state change to hold.");
			expect(buildRequestStateText("killed")).toBe("Requesting state change to killed.");
			expect(buildRequestStateText("in_progress")).toBe(
				"Requesting state change to in_progress.",
			);
		});
	});

	describe("findOrCreateTaskThread", () => {
		it("returns an existing thread when the GET response yields one", async () => {
			const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
				const url = String(input);
				expect(url).toContain("/api/threads");
				expect(url).toContain("host_kind=task");
				expect(url).toContain("host_id=t-1");
				return new Response(
					JSON.stringify({ threads: [{ id: "th-existing" }] }),
					{ status: 200, headers: { "content-type": "application/json" } },
				);
			});
			const client = createTaskThreadClient(fetchMock as unknown as typeof globalThis.fetch);
			const handle = await client.findOrCreateTaskThread("t-1");
			expect(handle).toEqual({ threadId: "th-existing" });
			expect(fetchMock).toHaveBeenCalledTimes(1);
		});

		it("creates a new thread via POST when GET returns an empty list", async () => {
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
				return new Response(JSON.stringify({ id: "th-new" }), {
					status: 201,
					headers: { "content-type": "application/json" },
				});
			});
			const client = createTaskThreadClient(fetchMock as unknown as typeof globalThis.fetch);
			const handle = await client.findOrCreateTaskThread("t-1");
			expect(handle).toEqual({ threadId: "th-new" });
			expect(createdBody).toMatchObject({ hostKind: "task", hostId: "t-1" });
		});
	});

	describe("postPlainMessage", () => {
		it("POSTs a plain message with the supplied clientKey", async () => {
			let recordedUrl: string | null = null;
			let recordedBody: Record<string, unknown> | null = null;
			const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				recordedUrl = String(input);
				recordedBody = JSON.parse(String(init?.body));
				return new Response(JSON.stringify({}), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			});
			const client = createTaskThreadClient(fetchMock as unknown as typeof globalThis.fetch);
			await client.postPlainMessage("th-1", "hello", "ck-12345678");
			expect(recordedUrl).toBe("/api/threads/th-1/messages");
			expect(recordedBody).toEqual({
				type: "plain",
				payload: { text: "hello" },
				clientKey: "ck-12345678",
			});
		});

		it("throws when the server responds with a non-2xx status", async () => {
			const fetchMock = vi.fn(
				async () =>
					new Response(JSON.stringify({ error: "boom" }), {
						status: 500,
						headers: { "content-type": "application/json" },
					}),
			);
			const client = createTaskThreadClient(fetchMock as unknown as typeof globalThis.fetch);
			await expect(client.postPlainMessage("th-1", "hi", "ck-12345678")).rejects.toThrow();
		});
	});
});
