/**
 * I2 — body-limit middleware that returns the project's canonical
 * `ApiErrorResponse` JSON shape on 413.
 *
 * Hono ships `hono/body-limit`, but its streaming branch only flips the
 * response back to `onError(c)` if the inner middleware leaves `c.error`
 * as a `BodyLimitError`. The project's validators (zValidator) catch the
 * upstream stream error and re-throw a "Malformed JSON" error, which
 * shadows the BodyLimitError and lets the global error handler return 500
 * — masking the real reason and breaking the test contract.
 *
 * Solution: pre-check `Content-Length` (the common case for JSON POSTs)
 * and short-circuit there. For chunked uploads without a length header
 * we drain the inbound stream into a buffer with EARLY ABORT — the moment
 * the running total crosses `maxSize` we cancel the upstream reader and
 * respond 413 immediately, without retaining the over-limit chunk and
 * without forwarding the request to the downstream handler.
 *
 * @lore I2 R4: see PR thread / docs/plans/I2-plan.md §3.4 for the
 * upstream-shape vs project-shape tradeoff. The project shape is required
 * by the API_ERROR_CODES.PAYLOAD_TOO_LARGE contract; we cannot pass a
 * plain string body.
 *
 * @lore I2 review CRITICAL-1 / A2: the chunked-POST branch used to
 * `chunks.push(value); if (total > maxSize)…` — the over-limit-detecting
 * check ran AFTER the chunk had been retained and the producer kept
 * sending. The fix:
 *   1. check `total + value.byteLength > maxSize` BEFORE `chunks.push`
 *      so an over-limit chunk is dropped on the floor;
 *   2. cancel the upstream reader the moment we cross the limit so the
 *      socket / test producer stops emitting chunks immediately;
 *   3. respond 413 directly from the middleware — no rebuild, no
 *      forwarding to downstream.
 *
 * @lore the under-limit path still has to rebuild `c.req.raw` because
 * the body has been drained for counting and downstream `c.req.json()`
 * needs to re-read it. This requires `duplex: "half"` on the new Request
 * — a field not yet in TypeScript's `lib.dom` `RequestInit` definition,
 * hence the narrow `as RequestInit` cast on the literal. Tracked
 * upstream as https://github.com/microsoft/TypeScript/issues/53157;
 * universal runtime support on Bun and Node 20+.
 *
 * In production the chunked-streaming branch is rarely hit — every real
 * client (browsers, Bun fetch, the Vite dev proxy) sends Content-Length
 * for JSON POSTs and short-circuits at the cheap header check above.
 */

import type { MiddlewareHandler } from "hono";
import { API_ERROR_CODES, type ApiErrorResponse } from "../api-types.js";

interface BodyLimitOptions {
	readonly maxSize: number;
}

function tooLargeResponse(c: Parameters<MiddlewareHandler>[0]): Response {
	const response: ApiErrorResponse = {
		error: "Payload too large",
		code: API_ERROR_CODES.PAYLOAD_TOO_LARGE,
	};
	return c.json(response, 413);
}

/**
 * Cancel an in-flight reader and swallow only the WHATWG-Streams "already
 * closed/locked" `TypeError`. Anything else propagates — it would be a real
 * I/O failure, not a cleanup race.
 */
async function safeCancelReader(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
	try {
		await reader.cancel();
	} catch (err) {
		if (!(err instanceof TypeError)) throw err;
	}
}

export function createBodyLimit(options: BodyLimitOptions): MiddlewareHandler {
	const { maxSize } = options;
	return async (c, next) => {
		const raw = c.req.raw;
		if (!raw.body) return next();

		const contentLengthHeader = raw.headers.get("content-length");
		if (contentLengthHeader) {
			const contentLength = Number.parseInt(contentLengthHeader, 10);
			if (Number.isFinite(contentLength) && contentLength > maxSize) {
				return tooLargeResponse(c);
			}
			// Content-Length present and within budget: defer to the normal
			// request stream — do not consume or re-buffer here.
			return next();
		}

		// No Content-Length. Drain the body with an EARLY-ABORT counter so
		// an over-limit producer is cut off the moment we know it's over —
		// before retaining the offending chunk in memory.
		const reader = raw.body.getReader();
		const chunks: Uint8Array[] = [];
		let total = 0;
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			// CRITICAL: check BEFORE retaining. An over-limit chunk is
			// dropped here and the upstream reader is cancelled so the
			// producer (socket / test stream) closes immediately.
			if (total + value.byteLength > maxSize) {
				await safeCancelReader(reader);
				return tooLargeResponse(c);
			}
			total += value.byteLength;
			chunks.push(value);
		}

		// Under-limit: rebuild the request so the downstream handler can
		// still read the body via c.req.json(). The `duplex: "half"` field
		// is required by the WHATWG Fetch spec for streaming request
		// bodies; the cast is documented in the @lore block above.
		const buffer = new Uint8Array(total);
		let offset = 0;
		for (const chunk of chunks) {
			buffer.set(chunk, offset);
			offset += chunk.byteLength;
		}
		c.req.raw = new Request(raw, { body: buffer, duplex: "half" } as RequestInit);

		await next();
	};
}
