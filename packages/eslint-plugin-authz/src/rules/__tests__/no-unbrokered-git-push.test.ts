/**
 * AO3 AC5 — ESLint RuleTester: authz/no-unbrokered-git-push
 *
 * Rule: flag any call to `.push(remote, branch)` on a runner-shaped receiver
 * (identifier/member ending in `runner`/`Runner`/`gitRunner`) in a non-allowlisted file.
 *
 * Allowlisted modules:
 *   - packages/fabric/src/services/git-export.ts     (knowledge-export legit pusher)
 *   - packages/server/src/tools/land-change.ts       (AO3 land_change handler)
 *
 * Unaffected: `Array.push`, `.push("item")` (1 arg), non-runner receivers.
 */

import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { noUnbrokeredGitPush } from "../no-unbrokered-git-push.js";
import { ruleTester } from "./setup.js";

RuleTester.describe = describe as unknown as typeof RuleTester.describe;
RuleTester.it = it as unknown as typeof RuleTester.it;

ruleTester.run("no-unbrokered-git-push", noUnbrokeredGitPush, {
	valid: [
		// 1. Call is in the git-export.ts allowlisted file.
		{
			filename: "packages/fabric/src/services/git-export.ts",
			code: `runner.push("origin", "main");`,
		},
		// 2. Call is in the land-change.ts allowlisted file.
		{
			filename: "packages/server/src/tools/land-change.ts",
			code: `runner.push("land", ref);`,
		},
		// 3. Array.push (1 arg, non-runner receiver) — not flagged.
		{
			filename: "packages/server/src/services/some-service.ts",
			code: `arr.push("item");`,
		},
		// 4. Array.push (1 arg even on runner-named receiver) — not flagged (1-arg call).
		{
			filename: "packages/server/src/services/some-service.ts",
			code: `runner.push("single-arg");`,
		},
		// 5. Non-runner receiver (2 args, but not runner-shaped).
		{
			filename: "packages/server/src/services/some-service.ts",
			code: `queue.push("remote", "branch");`,
		},
		// 6. deps.runner.push in git-export.ts (allowlisted).
		{
			filename: "packages/fabric/src/services/git-export.ts",
			code: `await deps.runner.push("origin", cfg.branch);`,
		},
	],
	invalid: [
		// 1. runner.push in a non-allowlisted server file.
		{
			filename: "packages/server/src/services/malicious.ts",
			code: `await runner.push("origin", "main");`,
			errors: [{ messageId: "unbrokeredGitPush" }],
		},
		// 2. gitRunner.push in a non-allowlisted file.
		{
			filename: "packages/server/src/routes/some-route.ts",
			code: `gitRunner.push("origin", "feat");`,
			errors: [{ messageId: "unbrokeredGitPush" }],
		},
		// 3. deps.runner.push in a non-allowlisted file.
		{
			filename: "packages/server/src/tools/some-other-tool.ts",
			code: `await deps.runner.push("remote", "branch");`,
			errors: [{ messageId: "unbrokeredGitPush" }],
		},
		// 4. MyGitRunner.push (identifier matching /Runner$/).
		{
			filename: "packages/fabric/src/services/other-service.ts",
			code: `await MyGitRunner.push("origin", "main");`,
			errors: [{ messageId: "unbrokeredGitPush" }],
		},
	],
});
