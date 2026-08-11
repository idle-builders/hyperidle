/**
 * test-isolation/no-literal-entity-ids (AU38 R1)
 *
 * Forbids string-literal values for `id` / `*Id` keys inside
 * `.insert(<table>).values({...})` object literals (and arrays of them) in
 * fixture-based service integration tests. Fix: `ids("<label>")` from the
 * `ids` fixture, so every arranged row is scoped per test.
 */

import { relative } from "node:path";
import type { Rule } from "eslint";
import type { CallExpression, Node, Property } from "estree";
import { importsFixtureTest, isIntegrationTestFile } from "../util.js";
import { isWaived, REPO_ROOT } from "../waivers.js";

export const RULE_NAME = "no-literal-entity-ids";

function isIdKey(property: Property): boolean {
	const key = property.key;
	if (key.type === "Identifier") return key.name === "id" || key.name.endsWith("Id");
	if (key.type === "Literal" && typeof key.value === "string") {
		return key.value === "id" || key.value.endsWith("Id");
	}
	return false;
}

function collectLiteralIds(valuesArg: Node, out: Node[]): void {
	if (valuesArg.type === "ObjectExpression") {
		for (const property of valuesArg.properties) {
			if (property.type !== "Property" || !isIdKey(property)) continue;
			const value = property.value;
			if (value.type === "Literal" && typeof value.value === "string") out.push(value);
		}
		return;
	}
	if (valuesArg.type === "ArrayExpression") {
		for (const element of valuesArg.elements) {
			if (element) collectLiteralIds(element, out);
		}
	}
}

function isInsertValuesCall(node: CallExpression): boolean {
	const callee = node.callee;
	if (
		callee.type !== "MemberExpression" ||
		callee.property.type !== "Identifier" ||
		callee.property.name !== "values"
	) {
		return false;
	}
	const receiver = callee.object;
	if (receiver.type !== "CallExpression" || receiver.callee.type !== "MemberExpression") {
		return false;
	}
	const receiverProperty = receiver.callee.property;
	return receiverProperty.type === "Identifier" && receiverProperty.name === "insert";
}

export const noLiteralEntityIds: Rule.RuleModule = {
	meta: {
		type: "problem",
		docs: {
			description:
				"fixture-based integration tests must not insert literal entity ids — use the ids fixture (AU38 R1)",
			recommended: true,
		},
		messages: {
			literalEntityId:
				'AU38 R1: literal entity id in .insert(...).values(...) — use ids("<label>") from the ids fixture so the row is scoped per test.',
		},
		schema: [],
	},
	create(context) {
		const filename = context.filename;
		if (!isIntegrationTestFile(filename)) return {};
		if (isWaived(RULE_NAME, relative(REPO_ROOT, filename))) return {};

		let importsFixtures = false;
		const violations: Node[] = [];

		return {
			ImportDeclaration(node) {
				if (importsFixtureTest(node)) importsFixtures = true;
			},
			CallExpression(node) {
				if (!isInsertValuesCall(node)) return;
				for (const arg of node.arguments) collectLiteralIds(arg as Node, violations);
			},
			"Program:exit"() {
				if (!importsFixtures) return;
				for (const node of violations) {
					context.report({ node: node as Rule.Node, messageId: "literalEntityId" });
				}
			},
		};
	},
};
