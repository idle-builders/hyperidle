/**
 * design/no-local-status-builder
 *
 * AI4 AC4 / Decision 7: No page-local status→color or status→label builder
 * remains in `packages/web/src`.
 *
 * Flags in `packages/web/src`:
 *   1. Function declarations / const arrow fns whose name matches:
 *      /.*(Badge|Chip)(Class|Style|Variant)$/  (e.g. taskStateBadgeClass, kindBadgeStyle)
 *   2. Object-literal const declarations whose name matches:
 *      /.*(STATE|STATUS|VERDICT|TYPE)_LABEL(S)?$/ (e.g. TASK_STATE_LABEL, TYPE_LABELS)
 *
 * Does NOT flag:
 *   - Files outside `packages/web/src` (shared/server/design-system are legitimate homes)
 *   - Non-status helpers (e.g. panelClass, statusText)
 *   - Consuming a label from a registry (import + variable read is fine)
 *
 * @lore AI4 Decision 7: Static codebase property → lint rule, not a test.
 * The heuristic is scoped to packages/web/src so the legitimate registry
 * homes (@hyperidle/shared, @hyperidle/server) never trigger.
 */

import type { Rule } from "eslint";
import { createRule } from "../util.js";

/** Regex for status-builder function/arrow-fn names */
const STATUS_BUILDER_FN_RE = /(Badge|Chip)(Class|Style|Variant)$/;

/** Regex for status-builder label-map const names */
const STATUS_LABEL_MAP_RE = /(STATE|STATUS|VERDICT|TYPE)_LABELS?$/;

/** Path segment that must appear for the rule to fire */
const WEB_SRC_SEGMENT = "packages/web/src";

function isWebSrcFile(filename: string): boolean {
	// Normalise Windows separators
	return filename.replace(/\\/g, "/").includes(WEB_SRC_SEGMENT);
}

export const noLocalStatusBuilder: Rule.RuleModule = createRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Forbid page-local status→color or status→label builders in packages/web/src. " +
				"Use @hyperidle/shared label registries and @hyperidle/design-system status-mapping instead.",
			recommended: true,
		},
		schema: [],
		messages: {
			localStatusBuilder:
				"Page-local status builder '{{name}}' is not allowed in packages/web/src. " +
				"Use the shared label registries (TASK_STATE_LABEL etc.) from @hyperidle/shared " +
				"or the status-mapping functions from @hyperidle/design-system.",
		},
	},
	create(context) {
		const filename = context.filename;
		if (!isWebSrcFile(filename)) {
			return {};
		}

		return {
			// function taskStateBadgeClass(state) { ... }
			FunctionDeclaration(node) {
				const name = node.id?.name;
				if (!name) return;
				if (STATUS_BUILDER_FN_RE.test(name) || STATUS_LABEL_MAP_RE.test(name)) {
					context.report({
						node,
						messageId: "localStatusBuilder",
						data: { name },
					});
				}
			},

			// const taskStateBadgeClass = (state) => ...
			// const TASK_STATE_LABEL = { ... }
			VariableDeclarator(node) {
				const id = node.id;
				if (id.type !== "Identifier") return;
				const name = id.name;

				// Arrow-fn / function-expression matching *BadgeClass/Style/Variant
				const init = node.init;
				if (
					init &&
					(init.type === "ArrowFunctionExpression" || init.type === "FunctionExpression") &&
					STATUS_BUILDER_FN_RE.test(name)
				) {
					context.report({
						node,
						messageId: "localStatusBuilder",
						data: { name },
					});
					return;
				}

				// Object-literal const matching *_STATE_LABEL / *_STATUS_LABEL / *_VERDICT_LABEL / *_TYPE_LABELS
				if (init && init.type === "ObjectExpression" && STATUS_LABEL_MAP_RE.test(name)) {
					context.report({
						node,
						messageId: "localStatusBuilder",
						data: { name },
					});
					return;
				}

				// Also flag arrow-fn matching label map names
				if (
					init &&
					(init.type === "ArrowFunctionExpression" || init.type === "FunctionExpression") &&
					STATUS_LABEL_MAP_RE.test(name)
				) {
					context.report({
						node,
						messageId: "localStatusBuilder",
						data: { name },
					});
				}
			},
		};
	},
});
