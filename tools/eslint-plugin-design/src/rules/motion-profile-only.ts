import type { Rule } from "eslint";
import { createRule } from "../util.js";
import {
	createStyleStringVisitors,
	reportProfileViolation,
	stylePropertyNames,
} from "./profile-rule-utils.js";

type AstNode = { type: string; parent?: AstNode; [key: string]: unknown };

const RAW_MOTION_TOKEN =
	/(?:^|\s)(?:[a-z-]+:)*(?:transition(?:-[^\s]+)?|duration-[^\s]+|ease-[^\s]+|animate-[^\s]+|\[(?:transition|transition-property|transition-duration|transition-timing-function|animation):[^\]]+\])(?=\s|$)/;
const RAW_STYLE_FIELDS =
	/^(?:animation|animationName|animationDuration|animationTimingFunction|transition|transitionProperty|transitionDuration|transitionTimingFunction|scrollBehavior)$/;

function callName(node: AstNode): string | null {
	const callee = node.callee as AstNode | undefined;
	if (callee?.type === "Identifier") return (callee.name as string | undefined) ?? null;
	if (callee?.type !== "MemberExpression") return null;
	const property = callee.property as { type?: string; name?: string; value?: unknown } | undefined;
	if (property?.type === "Identifier") return property.name ?? null;
	return property?.type === "Literal" && typeof property.value === "string" ? property.value : null;
}

function isAllowedAnimationFrame(filename: string, node: AstNode): boolean {
	const normalized = filename.replace(/\\/g, "/");
	if (normalized.endsWith("framework/design-system/src/RoleCombobox.tsx")) return true;
	if (normalized.endsWith("layers/core-ui/src/pages/KnowledgeDetail.tsx")) return true;
	if (!normalized.endsWith("layers/core-ui/src/layouts/AppShell.tsx")) return false;
	const args = (node.arguments as AstNode[] | undefined) ?? [];
	if (args[0]?.type === "Identifier" && args[0].name === "restore") return true;
	let current: AstNode | undefined = node.parent;
	while (current) {
		if (current.type === "FunctionDeclaration") {
			const id = current.id as { name?: string } | undefined;
			return id?.name === "restore";
		}
		if (current.type === "VariableDeclarator") {
			const id = current.id as { name?: string } | undefined;
			return id?.name === "restore";
		}
		current = current.parent;
	}
	return false;
}

export const motionProfileOnly: Rule.RuleModule = createRule({
	meta: {
		type: "problem",
		docs: {
			description: "Require purpose motion profiles and safe scheduling APIs.",
			recommended: true,
		},
		schema: [],
		messages: {
			rawMotion:
				"Raw motion '{{value}}' is not public API. Consume one motion-feedback/move/spring/enter/activity/loading/busy profile.",
			forbiddenMotionApi:
				"Authored animation and smooth-scroll APIs are forbidden; use a CSS motion profile.",
			forbiddenAnimationFrame:
				"requestAnimationFrame is allowed only for the four named focus/anchor/restore scheduling calls.",
		},
	},
	create(context) {
		if (context.filename.replace(/\\/g, "/").endsWith("/token-profiles.ts")) return {};
		const visitors = createStyleStringVisitors(context, (text, node) => {
			if (RAW_MOTION_TOKEN.test(text)) reportProfileViolation(context, node, "rawMotion", text);
		});
		return {
			JSXAttribute(rawNode: unknown) {
				visitors.jsxAttribute(rawNode);
				const node = rawNode as AstNode;
				const fields = stylePropertyNames(node).filter((name) => RAW_STYLE_FIELDS.test(name));
				if (fields.length > 0)
					reportProfileViolation(context, node, "rawMotion", fields.join(", "));
			},
			Property: visitors.property,
			VariableDeclarator: visitors.variableDeclarator,
			CallExpression(rawNode: unknown) {
				const node = rawNode as AstNode;
				const name = callName(node);
				if (
					name === "animate" ||
					name === "scrollTo" ||
					name === "scrollBy" ||
					name === "scrollIntoView"
				) {
					const source = context.sourceCode.getText(rawNode as Rule.Node);
					if (name === "animate" || /behavior\s*:\s*["']smooth["']/.test(source)) {
						context.report({ node: node as Rule.Node, messageId: "forbiddenMotionApi" });
					}
				}
				if (name === "requestAnimationFrame" && !isAllowedAnimationFrame(context.filename, node)) {
					context.report({ node: node as Rule.Node, messageId: "forbiddenAnimationFrame" });
				}
			},
		};
	},
});
