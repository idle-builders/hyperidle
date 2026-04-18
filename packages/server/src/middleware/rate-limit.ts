/**
 * I2 — In-process token-bucket rate limiter.
 *
 * Identity selection (most-specific first):
 *   1. `X-API-Key` header (hashed so we never store raw keys in the bucket map)
 *   2. The first IP in `x-forwarded-for` IF `HYPERIDLE_TRUST_PROXY === "true"`
 *   3. The direct client connection address (Bun: `c.env.remoteAddr.address`)
 *      or — when that is unavailable — a fixed `unknown` bucket (degraded
 *      single-bucket mode, documented in the I2 plan).
 *
 * On exceed: 429 + `Retry-After` (seconds) + JSON ApiErrorResponse with
 * `code: RATE_LIMITED`.
 *
 * @lore I2 R1-R5: deliberately hand-rolled (~60 LOC) instead of pulling in
 * `hono-rate-limiter`. Hono's middleware contract is small and the project's
 * dep budget is tight; an external lib's API surface costs more to track than
 * the implementation.
 */

import { createHash } from "node:crypto";
import { API_ERROR_CODES } from "@hyperidle/shared";
import type { ApiErrorResponse } from "@hyperidle/shared";
import type { Context, MiddlewareHandler } from "hono";

export interface RateLimiterOptions {
	readonly limit: number;
	readonly windowMs: number;
}

interface Bucket {
	count: number;
	resetAt: number;
}

const MAX_BUCKETS = 10_000;

function hashIdentity(prefix: string, raw: string): string {
	return `${prefix}:${createHash("sha256").update(raw).digest("hex").slice(0, 16)}`;
}

function readDirectAddr(c: Context): string | null {
	const env = (c.env ?? {}) as { remoteAddr?: { address?: string } };
	return env.remoteAddr?.address ?? null;
}

function pickIdentity(c: Context): string {
	const apiKey = c.req.header("X-API-Key");
	if (apiKey) return hashIdentity("k", apiKey);

	if (process.env.HYPERIDLE_TRUST_PROXY === "true") {
		const xff = c.req.header("x-forwarded-for");
		if (xff) {
			const first = xff.split(",")[0]?.trim();
			if (first) return hashIdentity("p", first);
		}
	}

	const direct = readDirectAddr(c);
	if (direct) return hashIdentity("c", direct);

	// Fallback: degraded global bucket. Documented in plan.
	return "global:fallback";
}

function evictOldest(buckets: Map<string, Bucket>): void {
	let oldestKey: string | null = null;
	let oldestResetAt = Number.POSITIVE_INFINITY;
	for (const [key, bucket] of buckets) {
		if (bucket.resetAt < oldestResetAt) {
			oldestResetAt = bucket.resetAt;
			oldestKey = key;
		}
	}
	if (oldestKey !== null) buckets.delete(oldestKey);
}

export function createRateLimiter(opts: RateLimiterOptions): MiddlewareHandler {
	const buckets = new Map<string, Bucket>();

	return async (c, next) => {
		const identity = pickIdentity(c);
		const now = Date.now();
		let bucket = buckets.get(identity);

		if (!bucket || bucket.resetAt <= now) {
			if (buckets.size >= MAX_BUCKETS) {
				evictOldest(buckets);
			}
			bucket = { count: 0, resetAt: now + opts.windowMs };
			buckets.set(identity, bucket);
		}

		bucket.count += 1;

		if (bucket.count > opts.limit) {
			const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
			const response: ApiErrorResponse = {
				error: "Rate limit exceeded",
				code: API_ERROR_CODES.RATE_LIMITED,
			};
			c.header("Retry-After", String(retryAfterSec));
			return c.json(response, 429);
		}

		await next();
	};
}
