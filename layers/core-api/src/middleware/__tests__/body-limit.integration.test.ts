/**
 * I2 — R4: oversized request bodies must return 413 with a JSON
 * ApiErrorResponse whose code is PAYLOAD_TOO_LARGE.
 *
 * The default Hono `bodyLimit` throws an HTTPException(413) with a text
 * response. I2 wires a custom `onError` so the response is the project's
 * canonical JSON error shape.
 *
 * Red phase: today the test app has no body-limit middleware mounted.
 * Hono does not bound request size by default, so a 2KB POST returns
 * whatever the route handler returns (here: a normal 4xx/5xx, not a 413
 * with the canonical error envelope).
 */

import { API_ERROR_CODES } from "@hyperidle/shared";
import { createBodyLimit } from "@hyperidle/shared/http";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-body-limit";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

describe("I2 R4 — body-limit middleware returns 413 + JSON ApiErrorResponse", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		// Set the limit very small so the test's payload is unambiguously
		// over budget. The middleware reads HYPERIDLE_MAX_BODY_BYTES.
		vi.stubEnv("HYPERIDLE_MAX_BODY_BYTES", "1024");
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("rejects a POST whose body exceeds the configured limit with 413", async ({ app }) => {
		// 2KB of payload — well above the 1024-byte limit set above.
		const huge = "x".repeat(2048);
		const body = JSON.stringify({ pitch: huge });

		const res = await app.request("/api/bets", {
			method: "POST",
			headers: authHeaders(),
			body,
		});

		expect(res.status).toBe(413);
		const json = (await res.json()) as { code?: string; error?: string };
		expect(json.code).toBe(API_ERROR_CODES.PAYLOAD_TOO_LARGE);
		expect(typeof json.error).toBe("string");
	});

	test("does NOT 413 a request that fits within the limit", async ({ app }) => {
		const small = JSON.stringify({ pitch: "tiny" });

		const res = await app.request("/api/bets", {
			method: "POST",
			headers: authHeaders(),
			body: small,
		});
		// Whatever the route does (likely 400 because we omitted required
		// fields), it must NOT be 413.
		expect(res.status).not.toBe(413);
	});
});

describe("I2 review CRITICAL-1 — chunked POST aborts as soon as size crosses the limit", () => {
	test("cancels the upstream reader before all chunks have been pulled", async ({}) => {
		const maxSize = 1024;
		// Build a Hono app whose only middleware is the body-limit. Mounting
		// the route directly avoids the rate-limit/auth ordering noise.
		const app = new Hono();
		app.use("*", createBodyLimit({ maxSize }));
		app.post("/probe", async (c) => {
			// If we ever reach the handler the test will fail (we expect 413).
			await c.req.text();
			return c.json({ ok: true });
		});

		// Stream 2 MiB in 1 KiB chunks WITHOUT a Content-Length header so
		// the middleware takes the streaming branch.
		const totalChunks = 2048;
		const chunkBytes = 1024;
		const chunkPayload = new Uint8Array(chunkBytes);
		chunkPayload.fill(0x41); // ASCII 'A'

		let chunksProduced = 0;
		const body = new ReadableStream<Uint8Array>({
			pull(controller) {
				if (chunksProduced >= totalChunks) {
					controller.close();
					return;
				}
				chunksProduced += 1;
				controller.enqueue(chunkPayload);
			},
		});

		// Build a Request without Content-Length. We must use the
		// `duplex: "half"` option so Node/Bun accept a stream body — but
		// this is on the test side (a known WHATWG Streams + Fetch API
		// requirement for streaming request bodies). The middleware under
		// test does NOT use this cast.
		// @lore I2 R4 review test: the production middleware must abort
		// the upstream reader as soon as `total > maxSize` so the producer
		// stops pulling. We assert below that fewer than 100% of chunks were
		// emitted before the connection closed.
		const init = { method: "POST", body, duplex: "half" } as unknown as RequestInit;
		const req = new Request("http://test/probe", init);

		const res = await app.fetch(req);

		expect(res.status).toBe(413);
		const json = (await res.json()) as { code?: string };
		expect(json.code).toBe(API_ERROR_CODES.PAYLOAD_TOO_LARGE);
		// Most importantly: the producer was halted long before all 2048
		// chunks were emitted. Allow some slack for in-flight pulls but
		// require we're nowhere near the full set.
		expect(chunksProduced).toBeLessThan(totalChunks);
		// Should have stopped roughly at the limit (1 KiB chunks vs 1 KiB
		// limit) — give ample slack for stream-internal buffering.
		expect(chunksProduced).toBeLessThan(64);
	});
});
