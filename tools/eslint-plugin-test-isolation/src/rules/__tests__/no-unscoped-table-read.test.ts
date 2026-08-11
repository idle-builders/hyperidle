import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { REPO_ROOT } from "../../waivers.js";
import { noUnscopedTableRead } from "../no-unscoped-table-read.js";
import { FIXTURE_FILE, FIXTURE_IMPORT, ruleTester } from "./setup.js";

RuleTester.describe = describe as unknown as typeof RuleTester.describe;
RuleTester.it = it as unknown as typeof RuleTester.it;

ruleTester.run("no-unscoped-table-read", noUnscopedTableRead, {
	valid: [
		// Scoped by where
		{
			filename: FIXTURE_FILE,
			code: `${FIXTURE_IMPORT}
				test("reads", async ({ db, ids }) => {
					const rows = await db.select().from(teams).where(eq(teams.id, ids("t1")));
				});`,
		},
		// where later in the chain (after orderBy)
		{
			filename: FIXTURE_FILE,
			code: `${FIXTURE_IMPORT}
				test("reads", async ({ db, ids }) => {
					const rows = await db.select().from(teams).orderBy(teams.name).where(eq(teams.id, ids("t1")));
				});`,
		},
		// No fixture-test import → rule does not apply
		{
			filename: FIXTURE_FILE,
			code: `import { createTestDb } from "@hyperidle/db/testing";
				test("reads", async () => {
					const db = await createTestDb();
					const rows = await db.select().from(teams);
				});`,
		},
		// Not an *.integration.test.ts file → rule does not apply
		{
			filename: "/repo/layers/core-api/src/__tests__/example.test.ts",
			code: `${FIXTURE_IMPORT}
				test("reads", async ({ db }) => {
					const rows = await db.select().from(teams);
				});`,
		},
	],
	invalid: [
		// Bare whole-table read
		{
			filename: FIXTURE_FILE,
			code: `${FIXTURE_IMPORT}
				test("reads", async ({ db }) => {
					const rows = await db.select().from(teams);
					expect(rows).toHaveLength(1);
				});`,
			errors: [{ messageId: "unscopedTableRead" }],
		},
		// Chain that ends without where (orderBy + limit only)
		{
			filename: FIXTURE_FILE,
			code: `${FIXTURE_IMPORT}
				test("reads", async ({ db }) => {
					const rows = await db.select().from(teams).orderBy(teams.createdAt).limit(1);
				});`,
			errors: [{ messageId: "unscopedTableRead" }],
		},
		// Select with column list, still unscoped
		{
			filename: FIXTURE_FILE,
			code: `${FIXTURE_IMPORT}
				test("reads", async ({ db }) => {
					const rows = await db.select({ id: teams.id }).from(teams);
				});`,
			errors: [{ messageId: "unscopedTableRead" }],
		},
	],
});

// Waiver suppression — same shape as the R1 case.
const { loadWaivers } = await import("../../waivers.js");
const waived = [...(loadWaivers()["no-unscoped-table-read"] ?? [])][0];
if (waived !== undefined) {
	const absolute = waived.startsWith("/") ? waived : `${REPO_ROOT}/${waived}`;
	ruleTester.run("no-unscoped-table-read (waived)", noUnscopedTableRead, {
		valid: [
			{
				filename: absolute,
				code: `${FIXTURE_IMPORT}
					test("reads", async ({ db }) => {
						const rows = await db.select().from(teams);
					});`,
			},
		],
		invalid: [],
	});
}
