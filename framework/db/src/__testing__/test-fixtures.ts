import { test as base } from "vitest";
import type { HyperIdleDb } from "../connection.js";
import { checkin, checkout } from "./test-pool.js";

export interface DbFixtures {
	db: HyperIdleDb;
}

type FixtureOrchestrationCleanup = () => void | Promise<void>;

interface FixtureCleanupBag {
	readonly owners: FixtureOrchestrationCleanup[];
}

export interface TestDbLease {
	readonly db: HyperIdleDb;
	readonly instance: Awaited<ReturnType<typeof checkout>>;
	readonly release: () => Promise<void>;
}

// @lore isolate:false reuses the worker DB after this fixture returns. Key the
// owner bag by its per-test wrapper, detach it before stopping every owner, and
// await them all before checkin so no late projection can cross that boundary.
const fixtureCleanupBags = new WeakMap<HyperIdleDb, FixtureCleanupBag>();

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

export function registerFixtureOrchestrationCleanup(
	db: HyperIdleDb,
	cleanup: FixtureOrchestrationCleanup,
): boolean {
	const bag = fixtureCleanupBags.get(db);
	if (!bag) return false;
	bag.owners.push(cleanup);
	return true;
}

export async function acquireTestDbLease(): Promise<TestDbLease> {
	const instance = await checkout();
	const db = wrapForTests(instance.db);
	const bag: FixtureCleanupBag = { owners: [] };
	fixtureCleanupBags.set(db, bag);
	let releasePromise: Promise<void> | null = null;

	const release = (): Promise<void> => {
		if (!releasePromise) {
			fixtureCleanupBags.delete(db);
			const results = bag.owners.reverse().map((owner) => {
				try {
					return Promise.resolve(owner());
				} catch (error) {
					return Promise.reject(error);
				}
			});
			releasePromise = Promise.allSettled(results).then((settled) => {
				checkin(instance);
				const failures = settled.flatMap((result) =>
					result.status === "rejected" ? [result.reason] : [],
				);
				if (failures.length === 1) throw failures[0];
				if (failures.length > 1) {
					throw new AggregateError(failures, "Fixture orchestration cleanup failed");
				}
			});
		}
		return releasePromise;
	};

	return { db, instance, release };
}

export const test = base.extend<DbFixtures>({
	db: async ({}, use) => {
		const lease = await acquireTestDbLease();
		try {
			await use(lease.db);
		} finally {
			await lease.release();
		}
	},
});

export { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
