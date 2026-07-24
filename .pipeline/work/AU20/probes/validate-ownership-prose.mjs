#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const read = (path) => readFileSync(resolve(path), "utf8");
const parse = (path) =>
	ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const commentsOnly = (source) =>
	[...source.matchAll(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g)]
		.map(([comment]) => comment.replace(/^\/\*+|\*+\/$/g, "").replace(/^\s*\*\s?/gm, " "))
		.join("\n");
const normalize = (value) => value.replace(/\s+/g, " ").trim();

function hasNamedImport(path, moduleName, importedName) {
	const source = parse(path);
	return source.statements.some(
		(node) =>
			ts.isImportDeclaration(node) &&
			ts.isStringLiteral(node.moduleSpecifier) &&
			node.moduleSpecifier.text === moduleName &&
			node.importClause?.namedBindings &&
			ts.isNamedImports(node.importClause.namedBindings) &&
			node.importClause.namedBindings.elements.some(
				(element) => (element.propertyName ?? element.name).text === importedName,
			),
	);
}

function hasExportedFunction(path, name) {
	const source = parse(path);
	return source.statements.some(
		(node) =>
			ts.isFunctionDeclaration(node) &&
			node.name?.text === name &&
			node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword),
	);
}

function hasNamedExport(path, name) {
	const source = parse(path);
	return source.statements.some(
		(node) =>
			ts.isExportDeclaration(node) &&
			node.exportClause &&
			ts.isNamedExports(node.exportClause) &&
			node.exportClause.elements.some((element) => (element.propertyName ?? element.name).text === name),
	);
}

function hasNamedReExport(path, moduleName, name) {
	const source = parse(path);
	return source.statements.some(
		(node) =>
			ts.isExportDeclaration(node) &&
			ts.isStringLiteral(node.moduleSpecifier) &&
			node.moduleSpecifier.text === moduleName &&
			node.exportClause &&
			ts.isNamedExports(node.exportClause) &&
			node.exportClause.elements.some((element) => (element.propertyName ?? element.name).text === name),
	);
}

function exportedFunction(source, name) {
	return source.statements.find(
		(node) =>
			ts.isFunctionDeclaration(node) &&
			node.name?.text === name &&
			node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword),
	);
}

const conditionalKinds = new Set([
	ts.SyntaxKind.IfStatement,
	ts.SyntaxKind.ConditionalExpression,
	ts.SyntaxKind.SwitchStatement,
	ts.SyntaxKind.ForStatement,
	ts.SyntaxKind.ForInStatement,
	ts.SyntaxKind.ForOfStatement,
	ts.SyntaxKind.WhileStatement,
	ts.SyntaxKind.DoStatement,
]);

function descendants(root, predicate, { skipNestedFunctions = false } = {}) {
	const matches = [];
	const visit = (node) => {
		if (node !== root && skipNestedFunctions && ts.isFunctionLike(node)) return;
		if (predicate(node)) matches.push(node);
		ts.forEachChild(node, visit);
	};
	visit(root);
	return matches;
}

function hasConditionalAncestor(node, boundary) {
	for (let cursor = node.parent; cursor && cursor !== boundary; cursor = cursor.parent) {
		if (conditionalKinds.has(cursor.kind)) return true;
		if (
			ts.isBinaryExpression(cursor) &&
			(cursor.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
				cursor.operatorToken.kind === ts.SyntaxKind.BarBarToken)
		) {
			return true;
		}
	}
	return false;
}

function exportedFunctionCalls(path, functionName, callee) {
	const source = parse(path);
	const owner = exportedFunction(source, functionName);
	if (!owner?.body) return false;
	const calls = descendants(
		owner.body,
		(node) =>
			ts.isCallExpression(node) &&
			ts.isIdentifier(node.expression) &&
			node.expression.text === callee,
		{ skipNestedFunctions: true },
	).filter((call) => !hasConditionalAncestor(call, owner.body));
	return calls.length > 0;
}

function liveServerUsesRunOrchestrationContext() {
	return (
		hasNamedReExport(
			"packages/agent-orchestration/run-orchestration/src/index.ts",
			"./start-runtime.js",
			"startRuntime",
		) &&
		hasNamedImport(
			"packages/agent-orchestration/run-orchestration/src/start-runtime.ts",
			"./context.js",
			"createContextAssembler",
		) &&
		exportedFunctionCalls(
			"packages/agent-orchestration/run-orchestration/src/start-runtime.ts",
			"startRuntime",
			"createContextAssembler",
		) &&
		hasNamedImport(
			"packages/core-api/src/services/run-orchestration-composition.ts",
			"@hyperidle/run-orchestration",
			"startRuntime",
		) &&
		exportedFunctionCalls(
			"packages/core-api/src/services/run-orchestration-composition.ts",
			"startRuntime",
			"startRuntimeInternal",
		) &&
		hasNamedImport(
			"packages/core-api/src/server-factory.ts",
			"./services/run-orchestration-composition.js",
			"startRuntime",
		) &&
		exportedFunctionCalls("packages/core-api/src/server-factory.ts", "createServer", "startRuntime")
	);
}

function liveServerRegistersLifecycleDrain() {
	const path = "packages/core-api/src/server-factory.ts";
	const source = parse(path);
	const createServer = exportedFunction(source, "createServer");
	const registerCore = exportedFunction(source, "registerCoreDomainServices");
	if (!createServer?.body || !registerCore?.body) return false;

	const createAppCalls = descendants(
		createServer.body,
		(node) =>
			ts.isCallExpression(node) &&
			ts.isIdentifier(node.expression) &&
			node.expression.text === "createApp",
		{ skipNestedFunctions: true },
	).filter((call) => !hasConditionalAncestor(call, createServer.body));
	if (createAppCalls.length !== 1) return false;

	const config = createAppCalls[0].arguments.find(ts.isObjectLiteralExpression);
	const bootstrap = config?.properties.find(
		(property) =>
			ts.isPropertyAssignment(property) &&
			((ts.isIdentifier(property.name) && property.name.text === "serviceBootstrap") ||
				(ts.isStringLiteral(property.name) && property.name.text === "serviceBootstrap")),
	);
	if (!bootstrap || !ts.isPropertyAssignment(bootstrap) || !ts.isArrowFunction(bootstrap.initializer)) {
		return false;
	}
	const bootstrapCalls = descendants(
		bootstrap.initializer.body,
		(node) =>
			ts.isCallExpression(node) &&
			ts.isIdentifier(node.expression) &&
			node.expression.text === "registerCoreDomainServices",
		{ skipNestedFunctions: true },
	).filter((call) => !hasConditionalAncestor(call, bootstrap.initializer.body));
	if (bootstrapCalls.length !== 1) return false;

	const drainCalls = descendants(
		registerCore.body,
		(node) =>
			ts.isCallExpression(node) &&
			ts.isIdentifier(node.expression) &&
			node.expression.text === "startLifecycleProjectionDrain" &&
			node.arguments.some(
				(argument) =>
					ts.isCallExpression(argument) &&
					ts.isIdentifier(argument.expression) &&
					argument.expression.text === "queueDeps",
			),
		{ skipNestedFunctions: true },
	).filter((call) => !hasConditionalAncestor(call, registerCore.body));
	return drainCalls.length === 1;
}

const targets = [
	{
		path: "packages/agent-orchestration/src/index.ts",
		deletedOwners: ["context-assembly"],
		approvedReplacement:
			"`@hyperidle/run-orchestration` is the current owner of context assembly.",
		obsoleteClaims: [
			{
				id: "F8-CONTEXT-DELETED-SERVICE-LIVE",
				text: "`@hyperidle/context-assembly` is now the real, fully-migrated Service",
			},
			{
				id: "F8-CONTEXT-DELETED-BINDING-LIVE",
				text: "wired into the live app at the actual composition root, `packages/server/src/services/context-assembly-bindings.ts`",
			},
		],
		historicalAllowlist: [
			{
				id: "F8-HISTORY-CONTEXT-PROOF",
				text: "minimal `context-assembly` proof-of-mechanism",
			},
			{
				id: "F8-HISTORY-CONTEXT-IN-PROCESS",
				text: "kept its in-process context-assembly for production while the proof stayed self-contained",
			},
			{
				id: "F8-HISTORY-CONTEXT-FINALIZE",
				text: "@lore AU19 Increment 3 (context-assembly finalize)",
			},
		],
		custody: [
			[
				() =>
					hasExportedFunction(
						"packages/agent-orchestration/run-orchestration/src/context.ts",
						"createContextAssembler",
					) && liveServerUsesRunOrchestrationContext(),
				"createContextAssembler is reached through startRuntime re-export, core composition, and exported createServer's unconditional live setup call",
			],
		],
	},
	{
		path: "packages/core-api/src/services/durable-agent-queue.ts",
		deletedOwners: ["lifecycle-projection", "session-lifecycle", "capture-writeback"],
		approvedReplacement:
			"`@hyperidle/session-requests` is the current owner of lifecycle projection.",
		obsoleteClaims: [
			{
				id: "F8-LIFECYCLE-DELETED-OWNER",
				text: "(owned by `lifecycle-projection`) — resolved at Increment 3d:",
			},
			{
				id: "F8-LIFECYCLE-DELETED-EXPORTS-LIVE",
				text: "now call `@hyperidle/lifecycle-projection`'s real exports instead of raw table ops",
			},
		],
		historicalAllowlist: [
			{
				id: "F8-HISTORY-LIFECYCLE-CLOSURE",
				text: "`lifecycle-projection`'s own Increment 3d closure",
			},
			{
				id: "F8-HISTORY-SESSION-LIFECYCLE-CALLSITE",
				text: "`session-lifecycle.ts`",
			},
		],
		custody: [
			[
				() =>
					hasNamedExport(
						"packages/agent-orchestration/session-requests/src/index.ts",
						"startLifecycleProjectionDrain",
					),
				"session-requests exports startLifecycleProjectionDrain",
			],
			[
				() =>
					hasNamedImport(
						"packages/core-api/src/server-factory.ts",
						"@hyperidle/session-requests",
						"startLifecycleProjectionDrain",
					),
				"the composition root imports the drain from session-requests",
			],
			[
				() => liveServerRegistersLifecycleDrain(),
				"exported createServer unconditionally supplies a serviceBootstrap that registers the surviving drain through exported registerCoreDomainServices",
			],
		],
	},
];

const failures = [];
for (const target of targets) {
	const prose = normalize(commentsOnly(read(target.path)));
	const findings = [];
	let inventoried = prose;
	for (const claim of target.obsoleteClaims) {
		if (prose.includes(claim.text)) findings.push(`${claim.id}: obsolete claim remains: ${claim.text}`);
		inventoried = inventoried.replaceAll(claim.text, "");
	}
	for (const exclusion of target.historicalAllowlist) {
		inventoried = inventoried.replaceAll(exclusion.text, "");
	}
	for (const deletedOwner of target.deletedOwners) {
		if (inventoried.toLowerCase().includes(deletedOwner)) {
			findings.push(
				`F8-UNINVENTORIED-${deletedOwner.toUpperCase()}: deleted-owner mention is outside the finite claim/allowlist inventory`,
			);
		}
	}
	if (!prose.includes(target.approvedReplacement)) {
		findings.push(`missing approved positive statement: ${target.approvedReplacement}`);
	}
	for (const [check, description] of target.custody) {
		if (!check()) findings.push(`replacement custody is not supported by syntax: ${description}`);
	}
	if (findings.length > 0) failures.push({ path: target.path, findings });
}

if (failures.length > 0) {
	console.error("ownership prose validation failed:");
	for (const failure of failures) {
		console.error(`- ${failure.path}`);
		for (const finding of failure.findings) console.error(`  - ${finding}`);
	}
	console.error(
		"Obsolete claims must be absent, deleted-owner history must match the path-bound allowlist, and the exact approved replacement claim must match parsed live-entrypoint custody.",
	);
	process.exitCode = 1;
} else {
	console.log("ownership prose validation passed");
}
