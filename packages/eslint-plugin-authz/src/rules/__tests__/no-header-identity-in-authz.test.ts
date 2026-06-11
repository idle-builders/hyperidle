/**
 * AF11 — RuleTester fixtures for authz/no-header-identity-in-authz (AC7).
 *
 * Rule: a value read from c.req.header(...) must never flow into an authz sink
 * (canRead, canWrite, authorizeRead, authorizeWrite).
 *
 * @lore AF11: The rule keys on a closed AUTHZ_SINKS set, NOT on a generic
 * BinaryExpression heuristic. The old assistant.ts readSenderId comparison is
 * removed by Hole 2, so the rule must not depend on it existing. The RuleTester
 * invalid fixture models future regressions directly.
 */

import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { noHeaderIdentityInAuthz } from "../no-header-identity-in-authz.js";
import { ruleTester } from "./setup.js";

RuleTester.describe = describe as unknown as typeof RuleTester.describe;
RuleTester.it = it as unknown as typeof RuleTester.it;

ruleTester.run("no-header-identity-in-authz", noHeaderIdentityInAuthz, {
	valid: [
		// Correct authz — reads from c.get("userId")
		{
			filename: "packages/server/src/routes/threads.ts",
			code: `
				const userId = c.get("userId");
				if (canRead(userId, resource)) {}
			`,
		},
		// Header used only for attribution (sender id recording), not authz sink
		{
			filename: "packages/server/src/routes/threads.ts",
			code: `
				const senderId = c.req.header("X-Identity") ?? c.get("userId");
				await db.insert(messages).values({ senderId });
			`,
		},
		// R5: /ws-token mint — header feeds store.issue (attribution, not authz sink)
		{
			filename: "packages/server/src/routes/auth.ts",
			code: `
				const identity = c.req.header("X-Identity");
				const token = store.issue(identity);
			`,
		},
		// Header in a non-authz call — not flagged
		{
			filename: "packages/server/src/routes/users.ts",
			code: `
				const name = c.req.header("X-Display-Name");
				log(name);
			`,
		},
		// authorizeRead called with c.get("userId") — valid
		{
			filename: "packages/server/src/routes/threads.ts",
			code: `
				const deny = authorizeRead(c.get("userId"), resource);
				if (deny) return deny;
			`,
		},
	],
	invalid: [
		// Direct: header result passed to canRead
		{
			filename: "packages/server/src/routes/threads.ts",
			code: `
				const id = c.req.header("X-Identity");
				if (canRead(id, resource)) {}
			`,
			errors: [{ messageId: "noHeaderInAuthz" }],
		},
		// Direct: header result passed to canWrite
		{
			filename: "packages/server/src/routes/threads.ts",
			code: `
				const id = c.req.header("X-Identity");
				if (canWrite(id, resource)) {}
			`,
			errors: [{ messageId: "noHeaderInAuthz" }],
		},
		// Direct: header result passed to authorizeRead
		{
			filename: "packages/server/src/routes/threads.ts",
			code: `
				const id = c.req.header("X-Identity");
				const deny = authorizeRead(id, resource);
			`,
			errors: [{ messageId: "noHeaderInAuthz" }],
		},
		// Direct: header result passed to authorizeWrite
		{
			filename: "packages/server/src/routes/threads.ts",
			code: `
				const id = c.req.header("X-Identity");
				const deny = authorizeWrite(id, resource);
			`,
			errors: [{ messageId: "noHeaderInAuthz" }],
		},
		// Inline: header call directly as first arg to canRead
		{
			filename: "packages/server/src/routes/threads.ts",
			code: `
				if (canRead(c.req.header("X-Identity"), resource)) {}
			`,
			errors: [{ messageId: "noHeaderInAuthz" }],
		},
	],
});
