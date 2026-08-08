/**
 * AU32 — per-entity companion balance check, over the whole diff.
 *
 * The governance lint's companion detector credits a whole FILE for one companion write
 * (buildWriteSets, crossing-detectors.ts:779-783) — that is a laundering hazard C6 names
 * explicitly, and it is exactly how eight `teams` entities in schema.integration.test.ts hid from
 * the lint (review.md B1). This script checks the property the lint cannot: for every arranged
 * entity (every `insert(teams)` / `insert(knowledgeItems)` call, or an equivalent seeder call)
 * inside one `test(...)`/`it(...)` scope in every file this work package's diff touches, is the
 * companion (`teamMembers` / `knowledgeAppProjection`) also written in that same scope?
 *
 * This is a one-off verification artifact, not a registered rule — it is not wired into
 * governance-lint.ts and does not run in CI. Re-run it by hand: `npx tsx
 * .pipeline/work/AU32/probes/per-entity-companion-check.mts`
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..", "..", "..");

const PAIRS: ReadonlyArray<{ owner: string; companion: string }> = [
	{ owner: "teams", companion: "teamMembers" },
	{ owner: "knowledgeItems", companion: "knowledgeAppProjection" },
];

// Helper calls (layers/core-api/src/__tests__/_helpers.ts) that write BOTH rows of a pair
// themselves — a scope calling one of these is credited with both tables of the pair(s) named.
const HELPER_CREDITS: Readonly<Record<string, readonly string[]>> = {
	seedTeam: ["teams", "teamMembers"],
	seedKnowledgeItem: ["knowledgeItems", "knowledgeAppProjection"],
	seedBase: ["teams", "teamMembers", "users", "threads"],
};

// The helper definitions themselves are exempt — they ARE the companion write, checking them
// against themselves is circular.
const EXEMPT_FILES = new Set(["layers/core-api/src/__tests__/_helpers.ts"]);

function touchedFiles(): string[] {
	const raw = execFileSync(
		"git",
		["diff", "--name-only", "origin/main...HEAD", "--", "layers/*", "framework/*", "applications/*", "tools/*"],
		{ cwd: REPO_ROOT, encoding: "utf8" },
	);
	return raw
		.split("\n")
		.map((l) => l.trim())
		.filter((l) => l.length > 0 && !EXEMPT_FILES.has(l));
}

interface ScopeResult {
	readonly file: string;
	readonly label: string;
	readonly line: number;
	readonly written: ReadonlySet<string>;
}

function scopesOf(file: string, source: string): ScopeResult[] {
	const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
	const results: ScopeResult[] = [];

	function collectWrites(node: ts.Node, into: Set<string>): void {
		function visit(n: ts.Node): void {
			if (ts.isCallExpression(n)) {
				// db.insert(<Identifier>)
				if (
					ts.isPropertyAccessExpression(n.expression) &&
					n.expression.name.text === "insert" &&
					n.arguments.length >= 1 &&
					ts.isIdentifier(n.arguments[0] as ts.Node)
				) {
					into.add((n.arguments[0] as ts.Identifier).text);
				}
				// bare helper(...) calls
				if (ts.isIdentifier(n.expression) && n.expression.text in HELPER_CREDITS) {
					for (const t of HELPER_CREDITS[n.expression.text] ?? []) into.add(t);
				}
			}
			ts.forEachChild(n, visit);
		}
		visit(node);
	}

	function visitTop(n: ts.Node): void {
		if (
			ts.isCallExpression(n) &&
			ts.isIdentifier(n.expression) &&
			(n.expression.text === "test" || n.expression.text === "it") &&
			n.arguments.length >= 2
		) {
			const nameArg = n.arguments[0];
			const label = ts.isStringLiteralLike(nameArg as ts.Node) ? (nameArg as ts.StringLiteral).text : "<unnamed>";
			const fn = n.arguments[1];
			if (fn !== undefined && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) {
				const written = new Set<string>();
				collectWrites(fn.body, written);
				const { line } = sourceFile.getLineAndCharacterOfPosition(n.getStart(sourceFile));
				results.push({ file, label, line: line + 1, written });
			}
		}
		ts.forEachChild(n, visitTop);
	}
	visitTop(sourceFile);
	return results;
}

const files = touchedFiles();
const findings: string[] = [];
let scopesChecked = 0;
let filesChecked = 0;

for (const file of files) {
	const full = path.join(REPO_ROOT, file);
	let source: string;
	try {
		source = readFileSync(full, "utf8");
	} catch {
		continue; // deleted in this diff
	}
	filesChecked += 1;
	const scopes = scopesOf(file, source);
	scopesChecked += scopes.length;
	for (const scope of scopes) {
		for (const { owner, companion } of PAIRS) {
			if (scope.written.has(owner) && !scope.written.has(companion)) {
				findings.push(`${file}:${scope.line} "${scope.label}" — writes ${owner} without ${companion}`);
			}
		}
	}
}

console.log(`per-entity companion check — ${filesChecked} file(s), ${scopesChecked} test scope(s) checked\n`);
if (findings.length === 0) {
	console.log("PASS — every arranged owner entity in every checked scope has its companion, or the scope is a seeder helper credited for both.");
} else {
	console.log(`FAIL — ${findings.length} unbalanced entit(y/ies):`);
	for (const f of findings) console.log(`  ${f}`);
	process.exitCode = 1;
}
