import { type HyperIdleDb, createTestDb } from "@hyperidle/db";
import { beforeEach, describe, expect, it } from "vitest";
import { knowledgeEvents } from "../events.js";
import { ftsSearch, setupFts } from "../fts.js";
import { create } from "../knowledge-repository.js";

/**
 * I3 — FTS5 sanitisation acceptance tests.
 *
 * Per AC (TRACK-I.md L151-154):
 *  - `ftsSearch` sanitises FTS5 operators (`AND`, `OR`, `NOT`, `NEAR`, `*`,
 *    `{`, `}`, `(`, `)`, `"`, `^`).
 *  - Query containing `*` does not match everything.
 *  - Query with unbalanced quotes does not throw.
 *
 * Per plan §3.6 the sanitiser strategy is whitelist-then-quote: each token
 * keeps word characters plus token-internal `-`, `_`, `'`; bare operator
 * words (`AND/OR/NOT/NEAR`) are lowercased so FTS5 treats them as literals;
 * each surviving token is wrapped in double quotes (literal phrase). An
 * empty result returns `[]` instead of running an empty MATCH (which throws
 * "syntax error").
 *
 * Plan note: the brief specifies test path
 * `packages/server/src/services/__tests__/fts-search.sanitization.test.ts`.
 * The `services/__tests__` directory does not exist and the function under
 * test lives in `@hyperidle/fabric/fts.ts`; placing the test next to the
 * existing `fts`-related fabric tests preserves locality. See "CONFUSION"
 * note in the I3 write-tests report.
 */

interface SeedItem {
	title: string;
	body: string;
}

function makeDb(items: SeedItem[] = []): HyperIdleDb {
	const db = createTestDb();
	setupFts(db);
	for (const item of items) {
		create(db, {
			layer: "L1",
			scopeId: "product-1",
			kind: "pattern",
			topic: null,
			title: item.title,
			body: item.body,
			format: "markdown",
			status: "active",
			updatedBy: "agent-1",
		});
	}
	return db;
}

const SAMPLE_ITEMS: SeedItem[] = [
	{ title: "Alpha", body: "first item alpha body" },
	{ title: "Beta", body: "second item beta body" },
	{ title: "Gamma", body: "third item gamma body" },
	{ title: "Delta", body: "fourth item delta body" },
	{ title: "Epsilon", body: "fifth item epsilon body" },
];

describe("I3: FTS sanitisation — operators are escaped", () => {
	beforeEach(() => {
		knowledgeEvents.removeAllListeners();
	});

	it("query 'test*' does not match everything (asterisk treated as literal)", () => {
		const db = makeDb(SAMPLE_ITEMS);
		const results = ftsSearch(db, "test*");
		// 5 items in the DB, none containing the word "test" — must NOT
		// match all rows. (A bare `*` in FTS5 is invalid syntax but `test*`
		// is a prefix-match operator that, unsanitised, returns matches for
		// any token starting with "test"; sanitised, it becomes the literal
		// phrase "test" which matches no rows.)
		expect(results.length).toBeLessThan(SAMPLE_ITEMS.length);
		// Specifically: zero rows, since no row contains the literal "test".
		expect(results).toEqual([]);
	});

	it("query 'unbalanced double quote does not throw", () => {
		const db = makeDb(SAMPLE_ITEMS);
		expect(() => ftsSearch(db, '"unbalanced')).not.toThrow();
	});

	it("query containing AND/OR/NOT/NEAR (lowercase) is sanitised — no syntax error", () => {
		const db = makeDb(SAMPLE_ITEMS);
		expect(() => ftsSearch(db, "AND OR NOT NEAR")).not.toThrow();
		expect(() => ftsSearch(db, "and or not near")).not.toThrow();
	});

	it("query containing parentheses, braces, caret does not throw", () => {
		const db = makeDb(SAMPLE_ITEMS);
		expect(() => ftsSearch(db, "( ) { } ^")).not.toThrow();
	});

	it("query 'test* OR admin' (operator combination) returns no false matches", () => {
		const db = makeDb(SAMPLE_ITEMS);
		// Validation scenario from TRACK-I.md L170 — operators must be
		// treated as literals. Since none of the seed items contain the
		// words "test" or "admin", the result must be empty.
		const results = ftsSearch(db, "test* OR admin");
		expect(results).toEqual([]);
	});

	it("query with balanced quote at end does not throw", () => {
		const db = makeDb(SAMPLE_ITEMS);
		expect(() => ftsSearch(db, 'foo"')).not.toThrow();
		expect(() => ftsSearch(db, 'foo"bar')).not.toThrow();
	});
});

describe("I3: FTS sanitisation — meaningful punctuation preserved", () => {
	beforeEach(() => {
		knowledgeEvents.removeAllListeners();
	});

	it("hyphenated tokens like 'react-router' are preserved as literal phrases", () => {
		const db = makeDb([
			{ title: "Routing", body: "Use react-router for client-side navigation." },
			{ title: "Other", body: "Different topic entirely." },
		]);
		const results = ftsSearch(db, "react-router");
		expect(results.length).toBeGreaterThan(0);
	});

	it("apostrophe tokens like \"don't\" are preserved", () => {
		const db = makeDb([
			{ title: "Habits", body: "Don't repeat yourself." },
			{ title: "Other", body: "Different topic entirely." },
		]);
		const results = ftsSearch(db, "don't");
		expect(results.length).toBeGreaterThan(0);
	});

	it("underscore tokens like 'my_var' are preserved", () => {
		const db = makeDb([
			{ title: "Variables", body: "Use snake_case my_var convention." },
			{ title: "Other", body: "Different topic entirely." },
		]);
		const results = ftsSearch(db, "my_var");
		expect(results.length).toBeGreaterThan(0);
	});
});

describe("I3: FTS sanitisation — empty / whitespace queries", () => {
	beforeEach(() => {
		knowledgeEvents.removeAllListeners();
	});

	it("empty string query returns [] without throwing", () => {
		const db = makeDb(SAMPLE_ITEMS);
		const results = ftsSearch(db, "");
		expect(results).toEqual([]);
	});

	it("whitespace-only query returns [] without throwing", () => {
		const db = makeDb(SAMPLE_ITEMS);
		const results = ftsSearch(db, "   \t \n  ");
		expect(results).toEqual([]);
	});

	it("operator-only query (all chars stripped) returns [] without throwing", () => {
		const db = makeDb(SAMPLE_ITEMS);
		// After stripping, nothing remains. Implementation must short-circuit
		// to [] rather than running MATCH '' (which throws).
		expect(() => ftsSearch(db, '"*(){}^')).not.toThrow();
		expect(ftsSearch(db, '"*(){}^')).toEqual([]);
	});
});
