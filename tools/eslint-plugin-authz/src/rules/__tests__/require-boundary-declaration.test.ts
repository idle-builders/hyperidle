/**
 * AF11 — RuleTester fixtures for authz/require-boundary-declaration (AC7).
 *
 * Rule: every data-route handler must either:
 *   (a) be wrapped with requireBoundary(...), or
 *   (b) call authorizeRead/authorizeWrite inside the handler, or
 *   (c) be on the explicit exempt allowlist.
 *
 * @lore AF11: The rule is deny-by-default in the lint: any new route file
 * under packages/server/src/routes/ that doesn't declare is flagged.
 * The exempt allowlist is a positive enumeration (not a wildcard).
 */

import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { requireBoundaryDeclaration } from "../require-boundary-declaration.js";
import { ruleTester } from "./setup.js";

RuleTester.describe = describe as unknown as typeof RuleTester.describe;
RuleTester.it = it as unknown as typeof RuleTester.it;

ruleTester.run("require-boundary-declaration", requireBoundaryDeclaration, {
	valid: [
		// Route with requireBoundary wrapper — valid
		{
			filename: "packages/server/src/routes/threads.ts",
			code: `
				router.get("/:id", requireBoundary({ kind: "enforced" }), async (c) => {
					const deny = authorizeRead(c, resource);
					if (deny) return deny;
					return c.json(data);
				});
			`,
		},
		// Route that calls authorizeRead inline — valid
		{
			filename: "packages/server/src/routes/threads.ts",
			code: `
				router.get("/list", async (c) => {
					requireBoundary({ kind: "principal-self" });
					return c.json(data);
				});
			`,
		},
		// Host-scope public route declared as public-data — valid
		{
			filename: "packages/server/src/routes/bets.ts",
			code: `
				router.get("/", requireBoundary({ kind: "public-data" }), async (c) => {
					return c.json(data);
				});
			`,
		},
		// Principal-self route declaration — valid
		{
			filename: "packages/server/src/routes/users.ts",
			code: `
				router.get("/inbox", requireBoundary({ kind: "principal-self" }), async (c) => {
					return c.json(data);
				});
			`,
		},
	],
	invalid: [
		// Data route with no boundary declaration — must be flagged
		{
			filename: "packages/server/src/routes/threads.ts",
			code: `
				router.get("/:id", async (c) => {
					const row = await db.select().from(threads).where(eq(threads.id, id));
					return c.json(row);
				});
			`,
			errors: [{ messageId: "missingBoundary" }],
		},
		// POST route without declaration — must be flagged
		{
			filename: "packages/server/src/routes/knowledge.ts",
			code: `
				router.post("/", async (c) => {
					const body = await c.req.json();
					return c.json({ id: "new" });
				});
			`,
			errors: [{ messageId: "missingBoundary" }],
		},
		// PATCH route without declaration — must be flagged
		{
			filename: "packages/server/src/routes/artifacts.ts",
			code: `
				router.patch("/:id", async (c) => {
					return c.json({ ok: true });
				});
			`,
			errors: [{ messageId: "missingBoundary" }],
		},
	],
});
