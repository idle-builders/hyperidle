import { test as base } from "vitest";
import type { HyperIdleDb } from "./connection.js";
import { checkin, checkout } from "./test-pool.js";

export interface DbFixtures {
	db: HyperIdleDb;
}

/**
 * Unwrap drizzle-orm 0.45.2+ wrapped errors in tests.
 *
 * @lore drizzle-orm 0.45.2: wraps PGlite errors with outer message "Failed query: …",
 * placing the original PGlite error (with trigger message / constraint code) in .cause.
 * Test assertions like `toThrow(/immutable/i)` check err.message — they fail when the
 * outer wrapper hides the real message. This normalizer re-throws with the cause's message
 * when the outer message starts with "Failed query:", making test assertions see the real
 * DB error message. Production code is NOT changed — it explicitly walks the cause chain
 * (see routes that handle 409/404 via isUniqueViolation and constraintMsg helpers).
 */
function unwrapDrizzleError(err: unknown): never {
	if (
		err instanceof Error &&
		err.message.startsWith("Failed query:") &&
		err.cause instanceof Error
	) {
		throw err.cause;
	}
	throw err;
}

/** Wrap a db handle so execute() surfaces PGlite errors instead of Drizzle-wrapped ones. */
function wrapForTests(db: HyperIdleDb): HyperIdleDb {
	return new Proxy(db, {
		get(target, prop) {
			if (prop === "execute") {
				return (...args: Parameters<HyperIdleDb["execute"]>) =>
					(target.execute as (...a: Parameters<HyperIdleDb["execute"]>) => Promise<unknown>)(
						...args,
					).catch(unwrapDrizzleError);
			}
			// biome-ignore lint/suspicious/noExplicitAny: Proxy passthrough for all other methods
			return (target as any)[prop];
		},
	});
}

export const test = base.extend<DbFixtures>({
	db: async ({}, use) => {
		const instance = await checkout();
		await use(wrapForTests(instance.db));
		checkin(instance);
	},
});

export { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
