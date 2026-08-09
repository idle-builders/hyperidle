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
 *
 * @lore I2 review HIGH-3 / HIGH-4:
 *  - identity hash uses the FULL SHA-256 hex (not truncated to 64 bits) so
 *    an attacker cannot brute-force a colliding header that lands a
 *    victim's quota into the attacker's bucket.
 *  - eviction is LEAST-RECENTLY-USED (smallest `lastSeenAt`), not "smallest
 *    `resetAt`". The previous policy preserved the most-active attacker
 *    state and evicted legitimate tenants who had recently reset.
 *
 * @lore I2 review W4: callers may pass `skipPaths` to exempt specific
 * route prefixes from the limiter (used for `/api/health` so k8s liveness
 * probes never trip the limiter).
 */

import { createHash } from "node:crypto";
import type { Context, MiddlewareHandler } from "hono";
import { API_ERROR_CODES, type ApiErrorResponse } from "../api-types.js";

export interface RateLimiterOptions {
	readonly limit: number;
	readonly windowMs: number;
	/**
	 * Optional path prefixes (matched against `c.req.path`) that bypass the
	 * limiter entirely. Use for liveness/readiness probe endpoints that fire
	 * at high rate from automated infra.
	 */
	readonly skipPaths?: readonly string[];
}

interface Bucket {
	count: number;
	resetAt: number;
	lastSeenAt: number;
}

const MAX_BUCKETS = 10_000;

function hashIdentity(prefix: string, raw: string): string {
	// Full 64-hex SHA-256 — 256 bits — defeats offline collision search.
	return `${prefix}:${createHash("sha256").update(raw).digest("hex")}`;
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

/**
 * Evict the LEAST-RECENTLY-USED bucket so legitimate, recently-active
 * tenants are preserved when the table is under pressure from an attacker
 * filling it with one-shot fake identities.
 */
function evictLeastRecentlyUsed(buckets: Map<string, Bucket>): void {
	let oldestKey: string | null = null;
	let oldestSeen = Number.POSITIVE_INFINITY;
	for (const [key, bucket] of buckets) {
		if (bucket.lastSeenAt < oldestSeen) {
			oldestSeen = bucket.lastSeenAt;
			oldestKey = key;
		}
	}
	if (oldestKey !== null) buckets.delete(oldestKey);
}

export function createRateLimiter(opts: RateLimiterOptions): MiddlewareHandler {
	const buckets = new Map<string, Bucket>();
	const skipPaths = opts.skipPaths ?? [];

	return async (c, next) => {
		// Probe-friendly bypass: k8s liveness/readiness fire at high rate
		// and must not consume rate-limit budget.
		if (skipPaths.length > 0) {
			const path = c.req.path;
			for (const prefix of skipPaths) {
				if (path === prefix || path.startsWith(`${prefix}/`)) {
					return next();
				}
			}
		}

		const identity = pickIdentity(c);
		const now = Date.now();
		let bucket = buckets.get(identity);

		if (!bucket || bucket.resetAt <= now) {
			if (buckets.size >= MAX_BUCKETS) {
				evictLeastRecentlyUsed(buckets);
			}
			bucket = { count: 0, resetAt: now + opts.windowMs, lastSeenAt: now };
			buckets.set(identity, bucket);
		}

		bucket.count += 1;
		bucket.lastSeenAt = now;

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
