/**
 * `isDirectKeyConflict` — the predicate `send_message`'s direct-thread
 * create-race retry (BC3 review-fix) uses to tell "someone else won the
 * `threads_direct_key_uq` race" apart from any other transaction failure.
 * Pure function, no DB — the retry itself (the two-transaction, catch-and-
 * re-read behavior) is proven against a real database in
 * thread-actions.integration.test.ts.
 */

import { describe, expect, test } from "vitest";
import { isDirectKeyConflict } from "../thread-actions.js";

describe("isDirectKeyConflict", () => {
	test("a direct Postgres unique-violation error naming the constraint is a conflict", () => {
		const err = new Error('duplicate key value violates unique constraint "threads_direct_key_uq"');
		expect(isDirectKeyConflict(err)).toBe(true);
	});

	test("drizzle-orm's wrapper error is walked via .cause to find the real error", () => {
		const real = new Error(
			'duplicate key value violates unique constraint "threads_direct_key_uq"',
		);
		const wrapped = new Error("Failed query: insert into threads...", { cause: real });
		expect(isDirectKeyConflict(wrapped)).toBe(true);
	});

	test("an unrelated unique violation (a different constraint) is not mistaken for this one", () => {
		const err = new Error('duplicate key value violates unique constraint "threads_pkey"');
		expect(isDirectKeyConflict(err)).toBe(false);
	});

	test("a non-Error thrown value is not a conflict", () => {
		expect(isDirectKeyConflict("some string")).toBe(false);
		expect(isDirectKeyConflict(undefined)).toBe(false);
	});

	test("an ordinary application error is not a conflict", () => {
		expect(isDirectKeyConflict(new Error("boom"))).toBe(false);
	});
});
