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

// @lore: isolate:false reuses worker DB — key owner bag by per-test wrapper; detach and await before checkin; no late projection crosses
const fixtureCleanupBags = new WeakMap<HyperIdleDb, FixtureCleanupBag>();

/**
 * Unwrap drizzle-orm 0.45.2+ wrapped errors in tests.
 *
 * @lore: drizzle-orm 0.45.2 wraps PGlite errors — "Failed query:…" outer msg hides cause; normalizer re-throws cause.message so assertions see real DB error
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
