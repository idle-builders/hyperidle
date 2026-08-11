import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { REPO_ROOT } from "../../waivers.js";
import { noLiteralEntityIds } from "../no-literal-entity-ids.js";
import { FIXTURE_FILE, FIXTURE_IMPORT, ruleTester } from "./setup.js";

RuleTester.describe = describe as unknown as typeof RuleTester.describe;
RuleTester.it = it as unknown as typeof RuleTester.it;

ruleTester.run("no-literal-entity-ids", noLiteralEntityIds, {
	valid: [
		// Scoped id via the ids fixture — the target pattern
		{
			filename: FIXTURE_FILE,
			code: `${FIXTURE_IMPORT}
				test("inserts", async ({ db, ids }) => {
					await db.insert(teams).values({ id: ids("t1"), name: "Alpha" });
				});`,
		},
		// Scoped FK column
		{
			filename: FIXTURE_FILE,
			code: `${FIXTURE_IMPORT}
				test("inserts", async ({ db, ids }) => {
					await db.insert(bets).values({ id: ids("b1"), teamId: ids("t1") });
				});`,
		},
		// Array of value objects, all scoped
		{
			filename: FIXTURE_FILE,
			code: `${FIXTURE_IMPORT}
				test("inserts", async ({ db, ids }) => {
					await db.insert(teams).values([{ id: ids("t1") }, { id: ids("t2") }]);
				});`,
		},
		// Non-id string literals stay allowed
		{
			filename: FIXTURE_FILE,
			code: `${FIXTURE_IMPORT}
				test("inserts", async ({ db, ids }) => {
					await db.insert(teams).values({ id: ids("t1"), name: "Alpha", phase: "build" });
				});`,
		},
		// randomUUID-generated id stays allowed
		{
			filename: FIXTURE_FILE,
			code: `${FIXTURE_IMPORT}
				test("inserts", async ({ db }) => {
					await db.insert(teams).values({ id: crypto.randomUUID(), name: "Alpha" });
				});`,
		},
		// No fixture-test import → rule does not apply (createTestDb-only file)
		{
			filename: FIXTURE_FILE,
			code: `import { createTestDb } from "@hyperidle/db/testing";
				test("inserts", async () => {
					const db = await createTestDb();
					await db.insert(teams).values({ id: "t1", name: "Alpha" });
				});`,
		},
		// Not an *.integration.test.ts file → rule does not apply
		{
			filename: "/repo/layers/core-api/src/__tests__/example.test.ts",
			code: `${FIXTURE_IMPORT}
				test("inserts", async ({ db }) => {
					await db.insert(teams).values({ id: "t1" });
				});`,
		},
		// test-fixtures mentioned only in a comment → rule does not apply
		{
			filename: FIXTURE_FILE,
			code: `// see ../__testing__/test-fixtures.js
				test("inserts", async () => {
					await db.insert(teams).values({ id: "t1" });
				});`,
		},
	],
	invalid: [
		// Literal id
		{
			filename: FIXTURE_FILE,
			code: `${FIXTURE_IMPORT}
				test("inserts", async ({ db }) => {
					await db.insert(teams).values({ id: "t1", name: "Alpha" });
				});`,
			errors: [{ messageId: "literalEntityId" }],
		},
		// Literal FK column (*Id)
		{
			filename: FIXTURE_FILE,
			code: `${FIXTURE_IMPORT}
				test("inserts", async ({ db }) => {
					await db.insert(bets).values({ id: ids("b1"), teamId: "t1" });
				});`,
			errors: [{ messageId: "literalEntityId" }],
		},
		// One violation per literal inside an array of value objects
		{
			filename: FIXTURE_FILE,
			code: `${FIXTURE_IMPORT}
				test("inserts", async ({ db }) => {
					await db.insert(teams).values([{ id: "t1" }, { id: "t2" }]);
				});`,
			errors: [{ messageId: "literalEntityId" }, { messageId: "literalEntityId" }],
		},
		// Aliased fixture import is still a fixture import
		{
			filename: FIXTURE_FILE,
			code: `import { test as it } from "@hyperidle/db/test-fixtures";
				it("inserts", async ({ db }) => {
					await db.insert(teams).values({ id: "t1" });
				});`,
			errors: [{ messageId: "literalEntityId" }],
		},
	],
});

// Waiver suppression: a file listed under ## no-literal-entity-ids in
// waivers.md reports nothing even for violating code. The entry is read
// dynamically so the case tracks the ratchet as it shrinks.
const { loadWaivers } = await import("../../waivers.js");
const waived = [...(loadWaivers()["no-literal-entity-ids"] ?? [])][0];
if (waived !== undefined) {
	const absolute = waived.startsWith("/") ? waived : `${REPO_ROOT}/${waived}`;
	ruleTester.run("no-literal-entity-ids (waived)", noLiteralEntityIds, {
		valid: [
			{
				filename: absolute,
				code: `${FIXTURE_IMPORT}
					test("inserts", async ({ db }) => {
						await db.insert(teams).values({ id: "t1" });
					});`,
			},
		],
		invalid: [],
	});
}
