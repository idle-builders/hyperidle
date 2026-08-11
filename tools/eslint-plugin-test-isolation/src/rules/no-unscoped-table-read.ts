/**
 * test-isolation/no-unscoped-table-read (AU38 R2)
 *
 * Forbids `db.select().from(<table>)` chains in fixture-based service
 * integration tests that reach their end without a `.where(...)` call.
 * Deliberately syntactic: it is the repeatable author-time check for the
 * empty-world assertion class, not a semantic oracle.
 */

import { relative } from "node:path";
import type { Rule } from "eslint";
import type { Node } from "estree";
import { importsFixtureTest, isIntegrationTestFile } from "../util.js";
import { isWaived, REPO_ROOT } from "../waivers.js";

export const RULE_NAME = "no-unscoped-table-read";

function isMethodCall(node: Node, name: string): boolean {
	return (
		node.type === "CallExpression" &&
		node.callee.type === "MemberExpression" &&
		node.callee.property.type === "Identifier" &&
		node.callee.property.name === name
	);
}

export const noUnscopedTableRead: Rule.RuleModule = {
	meta: {
		type: "problem",
		docs: {
			description:
				"fixture-based integration tests must scope every table read with .where(...) (AU38 R2)",
			recommended: true,
		},
		messages: {
			unscopedTableRead:
				"AU38 R2: unscoped whole-table read — a db.select().from(<table>) chain must call .where(...) so the assertion only sees rows this test arranged.",
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
				if (!isMethodCall(node, "from")) return;
				const receiver = (node.callee as { object?: Node }).object;
				if (!(receiver && isMethodCall(receiver, "select"))) return;

				let current: Node = node;
				let scoped = false;
				for (;;) {
					const parent = (current as Rule.Node).parent as Node | undefined;
					if (!parent || parent.type !== "MemberExpression" || parent.object !== current) {
						break;
					}
					const call = (parent as Rule.Node).parent as Node | undefined;
					if (!call || call.type !== "CallExpression" || call.callee !== parent) break;
					if (parent.property.type === "Identifier" && parent.property.name === "where") {
						scoped = true;
						break;
					}
					current = call;
				}
				if (!scoped) violations.push(node);
			},
			"Program:exit"() {
				if (!importsFixtures) return;
				for (const node of violations) {
					context.report({ node: node as Rule.Node, messageId: "unscopedTableRead" });
				}
			},
		};
	},
};
