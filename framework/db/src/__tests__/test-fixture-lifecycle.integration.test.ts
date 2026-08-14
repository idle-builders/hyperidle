import { users } from "@hyperidle/db";
import {
	acquireTestDbLease,
	registerFixtureOrchestrationCleanup,
} from "@hyperidle/db/test-fixtures";
import { eq } from "drizzle-orm";
import { expect, test } from "vitest";

function deferred(): { readonly promise: Promise<void>; readonly resolve: () => void } {
	let resolve: () => void = () => {};
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

test("fixture release joins late owner work before checkin and the next truncate", async () => {
	const first = await acquireTestDbLease();
	const releaseOwner = deferred();
	let ownerCalls = 0;
	expect(
		registerFixtureOrchestrationCleanup(first.db, async () => {
			ownerCalls += 1;
			await releaseOwner.promise;
			await first.db.insert(users).values({
				id: "late-fixture-owner-user",
				kind: "human",
				name: "Late owner",
				role: "founder",
				status: "active",
				createdAt: new Date().toISOString(),
			});
		}),
	).toBe(true);

	const release = first.release();
	let released = false;
	void release.then(() => {
		released = true;
	});
	await Promise.resolve();
	expect(released).toBe(false);
	expect(first.release()).toBe(release);

	releaseOwner.resolve();
	await release;
	expect(ownerCalls).toBe(1);

	const second = await acquireTestDbLease();
	try {
		expect(second.instance).toBe(first.instance);
		expect(
			await second.db.select().from(users).where(eq(users.id, "late-fixture-owner-user")),
		).toEqual([]);
	} finally {
		await second.release();
	}
});

test("fixture release settles every owner, aggregates in invocation order, and still checks in", async () => {
	const lease = await acquireTestDbLease();
	const firstFailure = new Error("first owner failed");
	const secondFailure = new Error("second owner failed");
	const calls: string[] = [];
	registerFixtureOrchestrationCleanup(lease.db, async () => {
		calls.push("first");
		throw firstFailure;
	});
	registerFixtureOrchestrationCleanup(lease.db, async () => {
		calls.push("sentinel");
	});
	registerFixtureOrchestrationCleanup(lease.db, () => {
		calls.push("second");
		throw secondFailure;
	});

	const failure = await lease.release().catch((error: unknown) => error);
	expect(calls).toEqual(["second", "sentinel", "first"]);
	expect(failure).toBeInstanceOf(AggregateError);
	expect((failure as AggregateError).errors).toEqual([secondFailure, firstFailure]);

	const reused = await acquireTestDbLease();
	try {
		expect(reused.instance).toBe(lease.instance);
	} finally {
		await reused.release();
	}
});

test("fixture release preserves one owner failure and rejects non-fixture registration", async () => {
	const lease = await acquireTestDbLease();
	const failure = new Error("only owner failed");
	expect(registerFixtureOrchestrationCleanup(lease.instance.db, async () => {})).toBe(false);
	registerFixtureOrchestrationCleanup(lease.db, async () => {
		throw failure;
	});

	await expect(lease.release()).rejects.toBe(failure);

	const reused = await acquireTestDbLease();
	try {
		expect(reused.instance).toBe(lease.instance);
	} finally {
		await reused.release();
	}
});
