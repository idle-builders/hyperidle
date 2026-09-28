/**
 * design/no-raw-actor-fetch
 *
 * Forbids raw `fetch("/api/...")` calls in `layers/core-ui/src/**` when the
 * route is actor-authenticated and should go through `useRecoveryFetch`
 * (or any future actor-aware helper) so that the `X-Actor-Id` header (and
 * any future cross-cutting recovery/CSRF/idempotency-key concerns) are
 * applied uniformly.
 *
 * Recurrence (3-track): L2, L4, L7. Each story shipped a route that
 * silently dropped the actor header because the call was a literal
 * `fetch(...)` outside the wrapper.
 *
 * Detection:
 *   CallExpression whose callee is the bare global identifier `fetch` and
 *   whose first argument is either:
 *     - a string literal starting with `/api/`, or
 *     - a template literal whose first quasi starts with `/api/`.
 *
 * Allowlist (legitimate wrappers): files under `layers/core-ui/src/hooks/`
 * may call `fetch()` directly because they ARE the actor-aware helpers.
 * Tests (`__tests__`) and Playwright specs (`*.spec.ts`) are also exempt
 * — tests routinely simulate raw network paths.
 *
 * The rule is wired at `error` in eslint.config.ts.
 */

import type { Rule } from "eslint";
import { createRule } from "../util.js";

type AnyNode = { type: string; [k: string]: unknown };

function isApiPath(value: string): boolean {
	return value.startsWith("/api/");
}

function getFirstArgPath(arg: unknown): string | null {
	if (!arg || typeof arg !== "object") return null;
	const node = arg as AnyNode;
	if (node.type === "Literal" && typeof node.value === "string") {
		return node.value;
	}
	if (node.type === "TemplateLiteral") {
		const quasis = node.quasis as Array<{ value: { cooked?: string; raw: string } }>;
		if (quasis.length === 0) return null;
		const first = quasis[0];
		if (!first) return null;
		const text = first.value.cooked ?? first.value.raw;
		return typeof text === "string" ? text : null;
	}
	return null;
}

/**
 * Files that legitimately wrap `fetch()` and therefore ARE the actor-aware
 * helpers. Matched via path-suffix tests so the rule is portable across
 * checkout layouts and worktrees.
 */
const HOOK_DIR_FRAGMENTS = ["/layers/core-ui/src/hooks/", "\\packages\\web\\src\\hooks\\"];

const TEST_FRAGMENTS = ["/__tests__/", "\\__tests__\\"];

const SPEC_SUFFIXES = [".spec.ts", ".spec.tsx", ".test.ts", ".test.tsx"];

function isAllowlistedFile(filename: string): boolean {
	if (HOOK_DIR_FRAGMENTS.some((f) => filename.includes(f))) return true;
	if (TEST_FRAGMENTS.some((f) => filename.includes(f))) return true;
	if (SPEC_SUFFIXES.some((s) => filename.endsWith(s))) return true;
	return false;
}

export const noRawActorFetch: Rule.RuleModule = createRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Forbid raw fetch('/api/...') calls outside layers/core-ui/src/hooks/ — actor-authenticated routes must go through useRecoveryFetch (or another actor-aware helper) so X-Actor-Id is set on every request.",
			recommended: true,
		},
		schema: [],
		messages: {
			rawActorFetch:
				"Raw fetch('{{path}}') drops the X-Actor-Id header. Use useRecoveryFetch (layers/core-ui/src/hooks/) or a sibling actor-aware helper instead.",
		},
	},
	create(context) {
		const filename = context.filename;
		if (isAllowlistedFile(filename)) return {};

		return {
			CallExpression(node) {
				const callee = node.callee as { type: string; name?: string };
				if (callee.type !== "Identifier" || callee.name !== "fetch") return;
				const args = node.arguments as unknown[];
				if (args.length === 0) return;
				const path = getFirstArgPath(args[0]);
				if (path === null) return;
				if (!isApiPath(path)) return;
				context.report({
					node,
					messageId: "rawActorFetch",
					data: { path },
				});
			},
		};
	},
});
