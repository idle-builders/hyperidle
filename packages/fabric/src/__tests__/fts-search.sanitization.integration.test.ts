import type { HyperIdleDb } from "@hyperidle/db";
import { beforeEach, describe, expect, test } from "@hyperidle/db/test-fixtures";
import { knowledgeEvents } from "../events.js";
import {
	FTS_MAX_QUERY_CHARS,
	FTS_MAX_TOKENS,
	ftsSearch,
	sanitizeFtsQuery,
	setupFts,
} from "../fts.js";
import { create } from "../knowledge-repository.js";

interface SeedItem {
	title: string;
	body: string;
}

async function seedItems(db: HyperIdleDb, items: SeedItem[]): Promise<void> {
	await setupFts(db);
	for (const item of items) {
		await create(db, {
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

	test("query 'test*' returns rows starting with 'test' but not unrelated rows", async ({ db }) => {
		await seedItems(db, SAMPLE_ITEMS);
		const results = await ftsSearch(db, "test*");
		expect(results).toEqual([]);
	});

	test("prefix search 'auth*' matches 'authentication' but not unrelated rows", async ({ db }) => {
		await seedItems(db, [
			{ title: "Auth Doc", body: "Configure authentication via OAuth providers." },
			{ title: "Routing", body: "Use react-router for client-side navigation." },
		]);
		const results = await ftsSearch(db, "auth*");
		expect(results.length).toBe(1);
	});

	test("prefix search 'auth*' does NOT match unrelated rows", async ({ db }) => {
		await seedItems(db, [
			{ title: "Authorization", body: "authorization-policy is enforced via authMiddleware" },
			{ title: "Other", body: "completely unrelated content" },
		]);
		const results = await ftsSearch(db, "auth*");
		expect(results.length).toBe(1);
	});

	test("query 'unbalanced double quote does not throw", async ({ db }) => {
		await seedItems(db, SAMPLE_ITEMS);
		await expect(ftsSearch(db, '"unbalanced')).resolves.not.toThrow();
	});

	test("query containing AND/OR/NOT/NEAR (lowercase) is sanitised — no syntax error", async ({
		db,
	}) => {
		await seedItems(db, SAMPLE_ITEMS);
		await expect(ftsSearch(db, "AND OR NOT NEAR")).resolves.not.toThrow();
		await expect(ftsSearch(db, "and or not near")).resolves.not.toThrow();
	});

	test("query containing parentheses, braces, caret does not throw", async ({ db }) => {
		await seedItems(db, SAMPLE_ITEMS);
		await expect(ftsSearch(db, "( ) { } ^")).resolves.not.toThrow();
	});

	test("query 'test* OR admin' (operator combination) returns no false matches", async ({ db }) => {
		await seedItems(db, SAMPLE_ITEMS);
		const results = await ftsSearch(db, "test* OR admin");
		expect(results).toEqual([]);
	});

	test("query with balanced quote at end does not throw", async ({ db }) => {
		await seedItems(db, SAMPLE_ITEMS);
		await expect(ftsSearch(db, 'foo"')).resolves.not.toThrow();
		await expect(ftsSearch(db, 'foo"bar')).resolves.not.toThrow();
	});
});

describe("I3: FTS sanitisation — meaningful punctuation preserved", () => {
	beforeEach(() => {
		knowledgeEvents.removeAllListeners();
	});

	test("hyphenated tokens like 'react-router' are preserved as literal phrases", async ({ db }) => {
		await seedItems(db, [
			{ title: "Routing", body: "Use react-router for client-side navigation." },
			{ title: "Other", body: "Different topic entirely." },
		]);
		const results = await ftsSearch(db, "react-router");
		expect(results.length).toBeGreaterThan(0);
	});

	test("apostrophe in body text does not break FTS indexing", async ({ db }) => {
		await seedItems(db, [
			{ title: "Habits", body: "Don't repeat yourself." },
			{ title: "Other", body: "Different topic entirely." },
		]);
		const results = await ftsSearch(db, "repeat");
		expect(results.length).toBeGreaterThan(0);
	});

	test("underscore tokens like 'my_var' are preserved", async ({ db }) => {
		await seedItems(db, [
			{ title: "Variables", body: "Use snake_case my_var convention." },
			{ title: "Other", body: "Different topic entirely." },
		]);
		const results = await ftsSearch(db, "my_var");
		expect(results.length).toBeGreaterThan(0);
	});
});

describe("I3 review sec MEDIUM-5: FTS DoS bounds", () => {
	beforeEach(() => {
		knowledgeEvents.removeAllListeners();
	});

	test("input longer than FTS_MAX_QUERY_CHARS is truncated, not thrown", () => {
		const huge = "x".repeat(FTS_MAX_QUERY_CHARS * 4);
		expect(() => sanitizeFtsQuery(huge)).not.toThrow();
		const out = sanitizeFtsQuery(huge);
		expect(out).toBe("x".repeat(FTS_MAX_QUERY_CHARS));
	});

	test("token count beyond FTS_MAX_TOKENS is truncated, not thrown", () => {
		const tokens = Array.from({ length: FTS_MAX_TOKENS + 32 }, (_, i) => `tok${i}`);
		const input = tokens.join(" ");
		expect(() => sanitizeFtsQuery(input)).not.toThrow();
		const out = sanitizeFtsQuery(input);
		const tokenCount = out.split(" & ").length;
		expect(tokenCount).toBe(FTS_MAX_TOKENS);
	});

	test("ftsSearch with a huge input does not throw", async ({ db }) => {
		await seedItems(db, SAMPLE_ITEMS);
		const huge = "alpha ".repeat(2000);
		await expect(ftsSearch(db, huge)).resolves.not.toThrow();
	});
});

describe("I3: FTS sanitisation — empty / whitespace queries", () => {
	beforeEach(() => {
		knowledgeEvents.removeAllListeners();
	});

	test("empty string query returns [] without throwing", async ({ db }) => {
		await seedItems(db, SAMPLE_ITEMS);
		const results = await ftsSearch(db, "");
		expect(results).toEqual([]);
	});

	test("whitespace-only query returns [] without throwing", async ({ db }) => {
		await seedItems(db, SAMPLE_ITEMS);
		const results = await ftsSearch(db, "   \t \n  ");
		expect(results).toEqual([]);
	});

	test("operator-only query (all chars stripped) returns [] without throwing", async ({ db }) => {
		await seedItems(db, SAMPLE_ITEMS);
		await expect(ftsSearch(db, '"*(){}^')).resolves.not.toThrow();
		expect(await ftsSearch(db, '"*(){}^')).toEqual([]);
	});
});
