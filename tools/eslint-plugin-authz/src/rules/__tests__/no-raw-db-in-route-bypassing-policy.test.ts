/**
 * AF11 — RuleTester fixtures for authz/no-raw-db-in-route-bypassing-policy (AC7).
 *
 * Rule: a route handler declared with requireBoundary({ kind: "enforced" })
 * (participant-scope) that performs a db.select/insert/update/delete must also
 * call authorizeRead or authorizeWrite somewhere in the same handler.
 *
 * @lore AF11: Narrow scope to avoid false positives on host-scope P routes.
 * High precision over recall per architecture §60. The runtime assertion +
 * integration tests cover what the lint can't see statically.
 */

import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { noRawDbInRouteBypassingPolicy } from "../no-raw-db-in-route-bypassing-policy.js";
import { ruleTester } from "./setup.js";

RuleTester.describe = describe as unknown as typeof RuleTester.describe;
RuleTester.it = it as unknown as typeof RuleTester.it;

ruleTester.run("no-raw-db-in-route-bypassing-policy", noRawDbInRouteBypassingPolicy, {
	valid: [
		// enforced boundary + authorizeRead called — valid
		{
			filename: "packages/server/src/routes/threads.ts",
			code: `
				router.get("/:id", requireBoundary({ kind: "enforced" }), async (c) => {
					const [row] = await db.select().from(threads).where(eq(threads.id, id));
					const deny = authorizeRead(c, { hostKind: row.hostKind, hostId: row.hostId, participants: row.participants });
					if (deny) return deny;
					return c.json(row);
				});
			`,
		},
		// public-data boundary + raw db query — no policy required (host-scope)
		{
			filename: "packages/server/src/routes/bets.ts",
			code: `
				router.get("/", requireBoundary({ kind: "public-data" }), async (c) => {
					const rows = await db.select().from(bets);
					return c.json(rows);
				});
			`,
		},
		// principal-self + no raw db — valid
		{
			filename: "packages/server/src/routes/users.ts",
			code: `
				router.get("/me", requireBoundary({ kind: "principal-self" }), async (c) => {
					return c.json({ id: c.get("userId") });
				});
			`,
		},
		// enforced boundary + authorizeWrite called — valid
		{
			filename: "packages/server/src/routes/threads.ts",
			code: `
				router.patch("/:id", requireBoundary({ kind: "enforced" }), async (c) => {
					const [row] = await db.select().from(threads).where(eq(threads.id, id));
					const deny = authorizeWrite(c, { hostKind: row.hostKind, hostId: row.hostId, participants: row.participants });
					if (deny) return deny;
					await db.update(threads).set({ pinned: true }).where(eq(threads.id, id));
					return c.json({ ok: true });
				});
			`,
		},
	],
	invalid: [
		// enforced boundary + db.select but no authorize call — must be flagged
		{
			filename: "packages/server/src/routes/threads.ts",
			code: `
				router.get("/:id", requireBoundary({ kind: "enforced" }), async (c) => {
					const [row] = await db.select().from(threads).where(eq(threads.id, id));
					return c.json(row);
				});
			`,
			errors: [{ messageId: "rawDbBypassesPolicy" }],
		},
		// enforced boundary + db.insert but no authorize call — must be flagged
		{
			filename: "packages/server/src/routes/messages.ts",
			code: `
				router.post("/", requireBoundary({ kind: "enforced" }), async (c) => {
					await db.insert(messages).values({ threadId: id, senderId: "u1" });
					return c.json({ ok: true });
				});
			`,
			errors: [{ messageId: "rawDbBypassesPolicy" }],
		},
	],
});
