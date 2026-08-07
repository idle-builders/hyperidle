/**
 * design/no-dialog-boilerplate — AI2 AC-5 static gate
 *
 * Forbids hand-rolled native-dialog boilerplate in migrated overlay surface files.
 * These patterns are deleted (not relocated) during the AI2 migration from native
 * <dialog> elements to the useDialogBehavior/Dialog primitive.
 *
 * Forbidden call expressions:
 *   - element.showModal()              — native dialog open method
 *   - element.setAttribute("open", .) — native dialog attribute toggle
 *   - element.addEventListener("cancel", .) — native dialog cancel-event block
 *
 * @lore AI2: AC-5 is a static codebase property — "per-file native-dialog
 * boilerplate gone from migrated surfaces." Enforced as a lint rule per CLAUDE.md
 * ("static property → lint/build script, not test"). The six migrated bare-<dialog>
 * files are the primary scope; the rule also catches regressions if a new surface
 * accidentally adds native-dialog mechanics.
 */

import type { Rule } from "eslint";
import { createRule } from "../util.js";

type AnyNode = { type: string; [k: string]: unknown };

function memberPropertyName(callee: AnyNode): string | null {
	if (callee.type !== "MemberExpression") return null;
	const prop = callee.property as AnyNode | null;
	if (!prop || prop.type !== "Identifier") return null;
	return (prop as { name?: string }).name ?? null;
}

function firstArgStringValue(args: unknown[]): string | null {
	const first = args[0];
	if (!first || typeof first !== "object") return null;
	const node = first as AnyNode;
	if (node.type === "Literal" && typeof node.value === "string") return node.value;
	return null;
}

export const noDialogBoilerplate: Rule.RuleModule = createRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Forbid native <dialog> boilerplate (showModal(), setAttribute('open'), addEventListener('cancel')) in migrated overlay surfaces. Use useDialogBehavior/Dialog from @hyperidle/design-system instead.",
			recommended: true,
		},
		schema: [],
		messages: {
			showModal:
				"showModal() is native-dialog boilerplate. Migrated overlays use useDialogBehavior/Dialog from @hyperidle/design-system. (AI2 AC-5)",
			setAttributeOpen:
				"setAttribute('open') on a dialog element is native-dialog boilerplate. Use the Dialog/useDialogBehavior open prop instead. (AI2 AC-5)",
			cancelListener:
				"addEventListener('cancel', ...) is native-dialog boilerplate. The AI2 dismissal grammar uses requestDismiss() via useDialogBehavior. (AI2 AC-5)",
		},
	},
	create(context) {
		return {
			CallExpression(node) {
				const callee = node.callee as AnyNode;
				const propName = memberPropertyName(callee);
				if (!propName) return;

				const args = node.arguments as unknown[];

				if (propName === "showModal") {
					context.report({ node, messageId: "showModal" });
					return;
				}

				if (propName === "setAttribute") {
					const val = firstArgStringValue(args);
					if (val === "open") {
						context.report({ node, messageId: "setAttributeOpen" });
					}
					return;
				}

				if (propName === "addEventListener") {
					const val = firstArgStringValue(args);
					if (val === "cancel") {
						context.report({ node, messageId: "cancelListener" });
					}
					return;
				}
			},
		};
	},
});
