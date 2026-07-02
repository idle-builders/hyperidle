/**
 * authz/no-unbrokered-git-push — AO3 AC5
 *
 * Flags any call to `.push(remote, branch)` on a runner-shaped receiver in a
 * non-allowlisted HyperIdle source module.
 *
 * @lore AO3 AC5: This rule guards AL7 hard-rule 2 — "HyperIdle's own code never
 * pushes of its own accord." The two legitimate pushers are:
 *   1. packages/fabric/src/services/git-export.ts  — knowledge-export
 *   2. packages/server/src/tools/land-change.ts    — AO3 agent-invoked landing tool
 *
 * This is a SELF-CODE constraint — it governs HyperIdle's own source, NOT the agent.
 * A CLI agent's shell `git push` is trusted and AL7-gated (staged-operation.md:175)
 * and is completely unaffected by this rule.
 *
 * The purged "broker is the only path" containment (staged-operation.md:41-43) is
 * deliberately NOT re-imported here — this rule is about code hygiene, not agent caging.
 *
 * Detection heuristic (high precision, low false-positive rate):
 *   Flag: callee is `<receiver>.push` with EXACTLY 2 arguments AND the receiver is
 *   runner-shaped — identifier named `runner`/`gitRunner`, a member access whose
 *   terminal property is `runner` (e.g. `deps.runner`), or an identifier matching
 *   the /Runner$/i suffix (e.g. `MyGitRunner`).
 *
 *   Skip: 1-arg `.push()` (Array.push), non-runner receivers (queue.push, arr.push).
 *   Skip: files in the allowlist (checked against context.filename).
 */

import type { Rule } from "eslint";
import type { CallExpression, MemberExpression } from "estree";

/**
 * Hardcoded allowlist of modules whose runner.push calls are legitimate.
 * Mirrors scripts/honest-harness-guard.allowlist.json pattern.
 *
 * @lore AO3 AC5: exactly two legitimate pushers. Add here ONLY when a new
 * HyperIdle code path is authorized to push — document the rationale as a @lore.
 */
const PUSH_ALLOWLIST: readonly string[] = [
	"packages/fabric/src/services/git-export.ts",
	"packages/server/src/tools/land-change.ts",
];

/**
 * Return true if the given receiver (callee.object of a MemberExpression) looks
 * like a GitRunner instance — not a generic array or queue.
 *
 * Matches:
 *   - Identifier: `runner`, `gitRunner`
 *   - Identifier matching /Runner$/i: `MyGitRunner`, `localRunner` (ends in "runner")
 *   - MemberExpression whose final property is `runner`: `deps.runner`, `this.runner`
 */
function isRunnerShaped(node: MemberExpression["object"]): boolean {
	if (node.type === "Identifier") {
		const name = node.name;
		// Exact matches for common runner names.
		if (name === "runner" || name === "gitRunner") return true;
		// Suffix match: ends with "Runner" (case-insensitive last 6 chars).
		if (/Runner$/i.test(name)) return true;
		return false;
	}

	// Member access: `deps.runner`, `this.runner`, `ctx.gitRunner`
	if (node.type === "MemberExpression" && !node.computed) {
		const prop = node.property;
		if (prop.type === "Identifier") {
			if (prop.name === "runner" || prop.name === "gitRunner") return true;
			if (/Runner$/i.test(prop.name)) return true;
		}
	}

	return false;
}

export const noUnbrokeredGitPush: Rule.RuleModule = {
	meta: {
		type: "problem",
		docs: {
			description:
				"HyperIdle's own code must not call GitRunner.push outside the two authorized modules (git-export.ts, land-change.ts). AL7 hard-rule 2.",
			recommended: true,
		},
		messages: {
			unbrokeredGitPush:
				"GitRunner.push called outside the authorized allowlist {git-export.ts, land-change.ts}. " +
				"HyperIdle's own code never pushes of its own accord (AL7 hard-rule 2). " +
				"If this is a legitimate new pusher, add it to the allowlist in no-unbrokered-git-push.ts with a @lore.",
		},
		schema: [],
	},

	create(context) {
		const filename = context.filename ?? "";

		// Check if any allowlisted path is a suffix of the current filename.
		// This handles both absolute paths and relative paths in the test fixtures.
		const isAllowlisted = PUSH_ALLOWLIST.some(
			(allowed) => filename.endsWith(allowed) || filename.includes(allowed),
		);

		if (isAllowlisted) return {};

		return {
			CallExpression(node: CallExpression) {
				// Must be a member expression callee: `<receiver>.push(...)`
				if (node.callee.type !== "MemberExpression") return;
				const callee = node.callee as MemberExpression;

				// The property must be `push`.
				if (callee.computed) return;
				if (callee.property.type !== "Identifier") return;
				if (callee.property.name !== "push") return;

				// Must have exactly 2 arguments (remote, branch).
				// Array.push typically has 1 arg; `.push(remote, branch)` has 2.
				if (node.arguments.length !== 2) return;

				// Receiver must look like a GitRunner.
				if (!isRunnerShaped(callee.object)) return;

				context.report({ node: node as Rule.Node, messageId: "unbrokeredGitPush" });
			},
		};
	},
};
