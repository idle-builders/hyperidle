import { type HyperIdleDb, createTestDb } from "@hyperidle/db";
import { beforeEach, describe, expect, it } from "vitest";
import { knowledgeEvents } from "../events.js";
import {
	FTS_MAX_QUERY_CHARS,
	FTS_MAX_TOKENS,
	ftsSearch,
	sanitizeFtsQuery,
	setupFts,
} from "../fts.js";
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

	// I3 review W5: prefix search via trailing `*` is now supported. A
	// `test*` query returns rows whose tokens start with "test" but does
	// NOT match unrelated rows. Bare `*` (no preceding token chars) is
	// still stripped.
	it("query 'test*' returns rows starting with 'test' but not unrelated rows", () => {
		const db = makeDb(SAMPLE_ITEMS);
		const results = ftsSearch(db, "test*");
		// Sample items don't contain any token starting with "test" — must
		// return zero rows, not all rows.
		expect(results).toEqual([]);
	});

	it("prefix search 'auth*' matches 'authentication' but not unrelated rows", () => {
		const db = makeDb([
			{ title: "Auth Doc", body: "Configure authentication via OAuth providers." },
			{ title: "Routing", body: "Use react-router for client-side navigation." },
		]);
		const results = ftsSearch(db, "auth*");
		// Should match the auth doc (token 'authentication' starts with
		// 'auth'); must not match routing.
		expect(results.length).toBe(1);
	});

	it("prefix search 'auth*' does NOT match unrelated 'authorization-policy' style rows", () => {
		const db = makeDb([
			{ title: "Authorization", body: "authorization-policy is enforced via authMiddleware" },
			{ title: "Other", body: "completely unrelated content" },
		]);
		// 'auth*' should match both 'authorization' (starts with auth)
		// AND 'authMiddleware' (starts with auth) → returns the row.
		// 'auth*' should NOT match 'unrelated' or 'completely'.
		const results = ftsSearch(db, "auth*");
		expect(results.length).toBe(1);
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

	it('apostrophe tokens like "don\'t" are preserved', () => {
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

// I3 review sec MEDIUM-5: bounded input length + token count.
describe("I3 review sec MEDIUM-5: FTS DoS bounds", () => {
	beforeEach(() => {
		knowledgeEvents.removeAllListeners();
	});

	it("input longer than FTS_MAX_QUERY_CHARS is truncated, not thrown", () => {
		const huge = "x".repeat(FTS_MAX_QUERY_CHARS * 4);
		expect(() => sanitizeFtsQuery(huge)).not.toThrow();
		const out = sanitizeFtsQuery(huge);
		// One token of x's, capped to the truncation length.
		expect(out).toBe(`"${"x".repeat(FTS_MAX_QUERY_CHARS)}"`);
	});

	it("token count beyond FTS_MAX_TOKENS is truncated, not thrown", () => {
		// Build a string with more than FTS_MAX_TOKENS distinct tokens.
		const tokens = Array.from({ length: FTS_MAX_TOKENS + 32 }, (_, i) => `tok${i}`);
		const input = tokens.join(" ");
		expect(() => sanitizeFtsQuery(input)).not.toThrow();
		const out = sanitizeFtsQuery(input);
		// Output is space-separated quoted phrases — count them.
		const phraseCount = out.split(" ").length;
		expect(phraseCount).toBe(FTS_MAX_TOKENS);
	});

	it("ftsSearch with a huge input does not throw", () => {
		const db = makeDb(SAMPLE_ITEMS);
		const huge = "alpha ".repeat(2000);
		expect(() => ftsSearch(db, huge)).not.toThrow();
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
