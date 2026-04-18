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
 * we fall back to a streaming bytes counter and reject before the body
 * is forwarded to the next middleware.
 *
 * @lore I2 R4: see PR thread / docs/plans/I2-plan.md §3.4 for the
 * upstream-shape vs project-shape tradeoff. The project shape is required
 * by the API_ERROR_CODES.PAYLOAD_TOO_LARGE contract; we cannot pass a
 * plain string body.
 */

import { API_ERROR_CODES } from "@hyperidle/shared";
import type { ApiErrorResponse } from "@hyperidle/shared";
import type { MiddlewareHandler } from "hono";

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
		}

		// Streaming fallback (no Content-Length). Buffer the bytes ourselves
		// so we can reject before the body reaches the route handler.
		const reader = raw.body.getReader();
		const chunks: Uint8Array[] = [];
		let total = 0;
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.byteLength;
			if (total > maxSize) {
				try {
					await reader.cancel();
				} catch {
					// Ignore — already done.
				}
				return tooLargeResponse(c);
			}
			chunks.push(value);
		}

		// Re-construct the request with a fresh body so downstream
		// middleware can still read it.
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
