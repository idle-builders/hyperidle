/**
 * design/no-unknown-cast
 *
 * Bans `X as unknown as T` double-assertions. Casting through `unknown` defeats
 * the type checker entirely — the value is laundered to `unknown` and then
 * asserted to anything, so no shape check survives. This is the #1 unsafe-cast
 * smell (.claude/rules/typescript.md: "no unsafe `as` casts"). Real bugs have
 * shipped behind it (a misshapen SessionConfig and a silently-undefined
 * FireResult.reason both compiled clean through `as unknown as`).
 *
 * Honest fixes: correct the types; contain ONE audited cast inside a typed
 * helper (e.g. `enumValues`, `asReportNode`); or validate at runtime (zod).
 *
 * Test / story / script files are exempt via eslint.config.ts — mock and
 * fixture construction legitimately fabricates partial shapes.
 */

import type { Rule } from "eslint";
import { asReportNode, createRule } from "../util.js";

export const noUnknownCast: Rule.RuleModule = createRule({
	meta: {
		type: "problem",
		docs: {
			description: "Ban `as unknown as T` double-assertions — they defeat the type checker.",
		},
		messages: {
			unknownCast:
				"`as unknown as T` is a forbidden double-assertion — it launders the value through `unknown` and defeats the type checker. Fix the types, contain a single audited cast in a typed helper, or validate at runtime.",
		},
		schema: [],
	},
	create(context) {
		return {
			// Outer node of `X as unknown as T`: a TSAsExpression whose `expression`
			// is the inner `X as unknown` (a TSAsExpression with an `unknown` annotation).
			"TSAsExpression[expression.type='TSAsExpression'][expression.typeAnnotation.type='TSUnknownKeyword']"(node: {
				type: string;
			}) {
				context.report({ node: asReportNode(node), messageId: "unknownCast" });
			},
		};
	},
});
