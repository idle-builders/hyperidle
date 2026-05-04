/**
 * L15: ensureTaskThread — GET-then-POST helper that resolves (or lazily
 * creates) the thread for a given task id.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("L15 ensureTaskThread", () => {
	let originalFetch: typeof fetch;

	beforeEach(() => {
		originalFetch = global.fetch;
	});

	afterEach(() => {
		global.fetch = originalFetch;
	});

	it("returns the existing thread id when GET /api/threads finds one", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = typeof input === "string" ? input : input.toString();
			if (url.includes("/api/threads") && url.includes("host_kind=task")) {
				return new Response(
					JSON.stringify({ threads: [{ id: "thread-existing", lastActiveAt: 1 }] }),
					{ status: 200, headers: { "content-type": "application/json" } },
				);
			}
			throw new Error(`unexpected url ${url}`);
		});
		global.fetch = fetchMock as unknown as typeof fetch;
		const { ensureTaskThread } = await import("../shell/ensureTaskThread");
		const res = await ensureTaskThread("t1");
		expect(res).toEqual({ ok: true, threadId: "thread-existing" });
	});

	it("creates a thread via POST /api/threads when none exists", async () => {
		const calls: string[] = [];
		const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = typeof input === "string" ? input : input.toString();
			calls.push(`${init?.method ?? "GET"} ${url}`);
			if (url.includes("/api/threads") && (init?.method ?? "GET") === "GET") {
				return new Response(JSON.stringify({ threads: [] }), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			}
			if (url.endsWith("/api/threads") && init?.method === "POST") {
				return new Response(JSON.stringify({ thread: { id: "thread-new" } }), {
					status: 201,
					headers: { "content-type": "application/json" },
				});
			}
			throw new Error(`unexpected ${url}`);
		});
		global.fetch = fetchMock as unknown as typeof fetch;
		const { ensureTaskThread } = await import("../shell/ensureTaskThread");
		const res = await ensureTaskThread("t2");
		expect(res).toEqual({ ok: true, threadId: "thread-new" });
		expect(calls.some((c) => c.startsWith("POST"))).toBe(true);
	});

	it("returns the most recently active thread when the server returns several", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = typeof input === "string" ? input : input.toString();
			if (url.includes("/api/threads") && url.includes("host_kind=task")) {
				return new Response(
					JSON.stringify({
						threads: [
							{ id: "older", lastActiveAt: 10 },
							{ id: "newer", lastActiveAt: 99 },
						],
					}),
					{ status: 200, headers: { "content-type": "application/json" } },
				);
			}
			throw new Error(`unexpected ${url}`);
		});
		global.fetch = fetchMock as unknown as typeof fetch;
		const { ensureTaskThread } = await import("../shell/ensureTaskThread");
		const res = await ensureTaskThread("t3");
		expect(res).toEqual({ ok: true, threadId: "newer" });
	});

	it("returns ok:false reason:server on POST 500 and does not populate the cache", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = typeof input === "string" ? input : input.toString();
			if (url.includes("/api/threads") && (init?.method ?? "GET") === "GET") {
				return new Response(JSON.stringify({ threads: [] }), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			}
			if (url.endsWith("/api/threads") && init?.method === "POST") {
				return new Response("boom", { status: 500 });
			}
			throw new Error(`unexpected ${url}`);
		});
		global.fetch = fetchMock as unknown as typeof fetch;
		const { ensureTaskThread } = await import("../shell/ensureTaskThread");
		const a = await ensureTaskThread("t4");
		expect(a.ok).toBe(false);
		// retrying must hit the network again (cache empty)
		const b = await ensureTaskThread("t4");
		expect(b.ok).toBe(false);
		expect(fetchMock).toHaveBeenCalledTimes(4);
	});

	it("returns ok:false reason:network when fetch throws", async () => {
		const fetchMock = vi.fn(async () => {
			throw new TypeError("offline");
		});
		global.fetch = fetchMock as unknown as typeof fetch;
		const { ensureTaskThread } = await import("../shell/ensureTaskThread");
		const res = await ensureTaskThread("t5");
		expect(res).toMatchObject({ ok: false, reason: "network" });
	});

	it("rejects malformed task ids with reason:validation and never hits the network", async () => {
		const fetchMock = vi.fn(async () => new Response("should not be called", { status: 500 }));
		global.fetch = fetchMock as unknown as typeof fetch;
		const { ensureTaskThread } = await import("../shell/ensureTaskThread");
		// path traversal / query smuggling attempts must be rejected client-side
		const r1 = await ensureTaskThread("../etc/passwd");
		expect(r1).toMatchObject({ ok: false, reason: "validation" });
		const r2 = await ensureTaskThread("t1&host_id=other");
		expect(r2).toMatchObject({ ok: false, reason: "validation" });
		const r3 = await ensureTaskThread("");
		expect(r3).toMatchObject({ ok: false, reason: "validation" });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("POST /api/threads body matches plan §4.5.6 contract (participants + initialMessage)", async () => {
		let postedBody: unknown = null;
		const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = typeof input === "string" ? input : input.toString();
			if (url.includes("/api/threads") && (init?.method ?? "GET") === "GET") {
				return new Response(JSON.stringify({ threads: [] }), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			}
			if (url.endsWith("/api/threads") && init?.method === "POST") {
				postedBody = JSON.parse(String(init.body));
				return new Response(JSON.stringify({ thread: { id: "thread-new" } }), {
					status: 201,
					headers: { "content-type": "application/json" },
				});
			}
			throw new Error(`unexpected ${url}`);
		});
		global.fetch = fetchMock as unknown as typeof fetch;
		const { ensureTaskThread } = await import("../shell/ensureTaskThread");
		const res = await ensureTaskThread("t-create");
		expect(res).toEqual({ ok: true, threadId: "thread-new" });
		const body = postedBody as {
			hostKind: string;
			hostId: string;
			participants: string[];
			initialMessage: { type: string; clientKey: string; payload: { text: string } };
		};
		expect(body.hostKind).toBe("task");
		expect(body.hostId).toBe("t-create");
		expect(body.participants.length).toBeGreaterThan(0);
		expect(body.initialMessage.type).toBe("plain");
		expect(body.initialMessage.clientKey.length).toBeGreaterThanOrEqual(8);
		expect(body.initialMessage.clientKey.length).toBeLessThanOrEqual(128);
		expect(body.initialMessage.payload.text).toMatch(/t-create/);
	});

	it("pickThreadId filters out unrelated host rows (defensive)", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = typeof input === "string" ? input : input.toString();
			if (url.includes("/api/threads") && url.includes("host_kind=task")) {
				return new Response(
					JSON.stringify({
						threads: [
							{ id: "wrong", hostKind: "bet", hostId: "x", lastActiveAt: 999 },
							{ id: "right", hostKind: "task", hostId: "t-pick", lastActiveAt: 1 },
						],
					}),
					{ status: 200, headers: { "content-type": "application/json" } },
				);
			}
			throw new Error(`unexpected ${url}`);
		});
		global.fetch = fetchMock as unknown as typeof fetch;
		const { ensureTaskThread } = await import("../shell/ensureTaskThread");
		const res = await ensureTaskThread("t-pick");
		expect(res).toEqual({ ok: true, threadId: "right" });
	});
});
