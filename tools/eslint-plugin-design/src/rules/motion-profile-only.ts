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

function normalizedSource(context: Rule.RuleContext, node: AstNode): string {
	return context.sourceCode.getText(node as Rule.Node).replace(/\s+/g, "");
}

function ancestorVariable(node: AstNode, name: string): boolean {
	let current = node.parent;
	while (current) {
		if (current.type === "VariableDeclarator") {
			const id = current.id as { name?: string } | undefined;
			if (id?.name === name) return true;
		}
		current = current.parent;
	}
	return false;
}

function animationFrameIdentity(
	context: Rule.RuleContext,
	filename: string,
	node: AstNode,
): string | null {
	const normalized = filename.replace(/\\/g, "/");
	const source = normalizedSource(context, node);
	if (normalized.endsWith("layers/core-ui/src/pages/KnowledgeDetail.tsx")) {
		const parent = node.parent as AstNode | undefined;
		const id =
			parent?.type === "VariableDeclarator" ? (parent.id as AstNode | undefined) : undefined;
		return id?.type === "Identifier" &&
			id.name === "raf" &&
			source.includes('document.querySelectorAll("[data-block-id]")') &&
			source.includes('node.getAttribute("data-block-id")===decoded') &&
			source.includes('?.scrollIntoView?.({block:"start"})')
			? "knowledge-anchor-scroll"
			: null;
	}
	if (!normalized.endsWith("layers/core-ui/src/layouts/AppShell.tsx")) return null;
	const parent = node.parent as AstNode | undefined;
	const left =
		parent?.type === "AssignmentExpression" ? (parent.left as AstNode | undefined) : undefined;
	if (
		source !== "window.requestAnimationFrame(restore)" ||
		left?.type !== "Identifier" ||
		left.name !== "frame"
	) {
		return null;
	}
	return ancestorVariable(node, "restore") ? "app-shell-restore-retry" : "app-shell-restore-start";
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
				"requestAnimationFrame is allowed only for the three named anchor/restore scheduling calls.",
		},
	},
	create(context) {
		if (context.filename.replace(/\\/g, "/").endsWith("/token-profiles.ts")) return {};
		const animationFrameIdentities = new Set<string>();
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
				if (name === "requestAnimationFrame") {
					const identity = animationFrameIdentity(context, context.filename, node);
					if (!identity || animationFrameIdentities.has(identity)) {
						context.report({ node: node as Rule.Node, messageId: "forbiddenAnimationFrame" });
					} else {
						animationFrameIdentities.add(identity);
					}
				}
			},
		};
	},
});
