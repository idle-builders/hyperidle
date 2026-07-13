#!/usr/bin/env tsx
/**
 * AU19 Mechanism A — Table ACL. ONE general, map-driven guard that replaces the
 * nine hand-typed `au10`…`au18` per-domain scripts (retired in Increment 5).
 *
 * Two tiers (architecture §7.1):
 *  1. Barrel discipline — a nested Service barrel (`packages/<layer>/<service>/
 *     src/index.ts`) MUST NOT re-export a raw `pgTable` object. That would let a
 *     consumer obtain the table transitively through the Service and defeat the ACL.
 *  2. Ownership ACL — for every table in `TABLE_OWNER`, any Drizzle access
 *     (`.from/.insert/.update/.delete/.leftJoin/.innerJoin/.rightJoin/.fullJoin`
 *     of the bare table identifier) OR any value import of that table symbol, in a
 *     nested-package production file NOT under the owner path → FAIL. Plus a
 *     completeness rule: a known `pgTable` accessed by a nested package with no
 *     `TABLE_OWNER` row → FAIL (forces the map to stay complete as Services migrate).
 *
 * @lore AU19 Increment 0 scope: the ACL/completeness tiers scan the NEW nested
 * Service packages (`packages/<layer>/<service>/`) only — `packages/server` stays
 * guarded by the legacy `au*` scripts until Increment 5, when every owner package
 * exists and this guard replaces them repo-wide in one edit. Barrel discipline +
 * `--fixtures` prove all three failure modes now. Test files are exempt from the
 * ACL (they legitimately seed tables). The full `@hyperidle/db` barrel exports every
 * table to everyone, so this guard — not barrel discipline alone — is load-bearing.
 */
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import ts from "typescript";

/** The single source of truth for table ownership. One row per owned table. */
const TABLE_OWNER: Record<string, string> = {
	knowledgeItems: "packages/core-api/knowledge",
	// …one row per table, populated as each Service migrates (Increments 1–4).
};

const DIRECT_ACCESS_METHODS = new Set(["from", "insert", "update", "delete"]);
const JOIN_METHODS = new Set(["leftJoin", "innerJoin", "rightJoin", "fullJoin"]);
const ACCESS_METHODS = new Set([...DIRECT_ACCESS_METHODS, ...JOIN_METHODS]);

export interface Finding {
	readonly file: string;
	readonly reason: string;
}

/** Extract every `export const <name> = pgTable(...)` name from the db schema. */
function knownTables(root: string): Set<string> {
	const schema = join(root, "packages/db/src/schema.ts");
	const names = new Set<string>();
	if (!existsSync(schema)) return names;
	const text = readFileSync(schema, "utf8");
	const re = /export const (\w+)\s*=\s*pgTable\b/g;
	for (let m = re.exec(text); m !== null; m = re.exec(text)) {
		if (m[1]) names.add(m[1]);
	}
	return names;
}

/** Recursively collect production `.ts`/`.tsx` files under a dir (skip tests/dist). */
function collectSourceFiles(dir: string): string[] {
	const out: string[] = [];
	if (!existsSync(dir)) return out;
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const abs = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "__tests__") {
				continue;
			}
			out.push(...collectSourceFiles(abs));
		} else if (
			/\.tsx?$/.test(entry.name) &&
			!/\.test\.tsx?$/.test(entry.name) &&
			!/\.integration\.test\.tsx?$/.test(entry.name)
		) {
			out.push(abs);
		}
	}
	return out;
}

/** All nested Service package roots: `packages/<layer>/<service>/`. */
function nestedServiceRoots(root: string): string[] {
	const packagesDir = join(root, "packages");
	const roots: string[] = [];
	if (!existsSync(packagesDir)) return roots;
	for (const layer of readdirSync(packagesDir, { withFileTypes: true })) {
		if (!layer.isDirectory()) continue;
		const layerDir = join(packagesDir, layer.name);
		for (const svc of readdirSync(layerDir, { withFileTypes: true })) {
			if (!svc.isDirectory()) continue;
			if (existsSync(join(layerDir, svc.name, "package.json"))) {
				roots.push(join(layerDir, svc.name));
			}
		}
	}
	return roots;
}

function isUnder(fileRel: string, ownerRel: string): boolean {
	return fileRel === ownerRel || fileRel.startsWith(`${ownerRel}/`);
}

/** Tier 1 — barrel re-exports a raw pgTable name. */
function checkBarrel(root: string, serviceRoot: string, tables: Set<string>): Finding[] {
	const barrel = join(serviceRoot, "src/index.ts");
	if (!existsSync(barrel)) return [];
	const rel = relative(root, barrel);
	const text = readFileSync(barrel, "utf8");
	const ast = ts.createSourceFile(barrel, text, ts.ScriptTarget.Latest, true);
	const findings: Finding[] = [];
	const flag = (name: string): void => {
		if (tables.has(name)) {
			findings.push({
				file: rel,
				reason: `barrel re-exports raw table "${name}" — export typed functions only (Table ACL, Mechanism A)`,
			});
		}
	};
	const visit = (node: ts.Node): void => {
		// export { knowledgeItems } / export { knowledgeItems } from "@hyperidle/db"
		if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
			if (!node.isTypeOnly) {
				for (const el of node.exportClause.elements) {
					if (!el.isTypeOnly) flag((el.propertyName ?? el.name).text);
				}
			}
		}
		// export const knowledgeItems = ...
		if (
			ts.isVariableStatement(node) &&
			node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
		) {
			for (const decl of node.declarationList.declarations) {
				if (ts.isIdentifier(decl.name)) flag(decl.name.text);
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(ast);
	return findings;
}

/** Tier 2 — ownership ACL + completeness, over a nested prod file. */
function checkAccess(
	root: string,
	abs: string,
	tables: Set<string>,
): Finding[] {
	const rel = relative(root, abs);
	const text = readFileSync(abs, "utf8");
	const ast = ts.createSourceFile(abs, text, ts.ScriptTarget.Latest, true);
	const findings: Finding[] = [];

	const consider = (name: string, kind: string): void => {
		if (!tables.has(name)) return; // not a table object
		const owner = TABLE_OWNER[name];
		if (owner === undefined) {
			findings.push({
				file: rel,
				reason: `${kind} touches table "${name}" which has no TABLE_OWNER row — add it (completeness)`,
			});
			return;
		}
		if (!isUnder(rel, owner)) {
			findings.push({
				file: rel,
				reason: `${kind} touches "${name}" owned by ${owner} — route through that Service (Table ACL)`,
			});
		}
	};

	const visit = (node: ts.Node): void => {
		// Drizzle access: db.from/insert/…(bareTable)
		if (
			ts.isCallExpression(node) &&
			ts.isPropertyAccessExpression(node.expression) &&
			ACCESS_METHODS.has(node.expression.name.text)
		) {
			const arg = node.arguments[0];
			if (arg && ts.isIdentifier(arg)) {
				consider(arg.text, `.${node.expression.name.text}(...)`);
			}
		}
		// Value import of a table symbol from @hyperidle/db
		if (
			ts.isImportDeclaration(node) &&
			ts.isStringLiteral(node.moduleSpecifier) &&
			node.moduleSpecifier.text === "@hyperidle/db" &&
			node.importClause &&
			!node.importClause.isTypeOnly &&
			node.importClause.namedBindings &&
			ts.isNamedImports(node.importClause.namedBindings)
		) {
			for (const el of node.importClause.namedBindings.elements) {
				if (!el.isTypeOnly) consider(el.name.text, "value import");
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(ast);
	return findings;
}

export function inspect(root: string): Finding[] {
	const tables = knownTables(root);
	const findings: Finding[] = [];
	for (const serviceRoot of nestedServiceRoots(root)) {
		findings.push(...checkBarrel(root, serviceRoot, tables));
		for (const abs of collectSourceFiles(join(serviceRoot, "src"))) {
			findings.push(...checkAccess(root, abs, tables));
		}
	}
	return findings;
}

// -- fixtures self-test --

function writeFixture(root: string, rel: string, source: string): void {
	const abs = join(root, rel);
	mkdirSync(dirname(abs), { recursive: true });
	writeFileSync(abs, source);
}

/** Minimal schema so knownTables() sees the tables the fixtures reference. */
const FIXTURE_SCHEMA =
	'export const knowledgeItems = pgTable("knowledge_items", {});\n' +
	'export const bets = pgTable("bets", {});\n';

function fixtureCheck(): void {
	// (1) Owner-legal + one foreign access + completeness, in one realistic tree.
	const root = mkdtempSync(join(tmpdir(), "au19-table-guard-"));
	try {
		writeFixture(root, "packages/db/src/schema.ts", FIXTURE_SCHEMA);
		writeFixture(
			root,
			"packages/core-api/knowledge/package.json",
			'{ "name": "@hyperidle/knowledge" }',
		);
		writeFixture(
			root,
			"packages/agent-orchestration/context-assembly/package.json",
			'{ "name": "@hyperidle/context-assembly" }',
		);
		// Owner file legally accesses knowledgeItems → no finding.
		writeFixture(
			root,
			"packages/core-api/knowledge/src/knowledge-reader.ts",
			'import { knowledgeItems } from "@hyperidle/db"; export const q = (db: any) => db.select().from(knowledgeItems);',
		);
		// Clean owner barrel → no finding.
		writeFixture(
			root,
			"packages/core-api/knowledge/src/index.ts",
			'export { list } from "./knowledge-reader.js";',
		);
		// Foreign nested file accesses knowledgeItems → 1 ACL finding.
		writeFixture(
			root,
			"packages/agent-orchestration/context-assembly/src/leak.ts",
			'import { knowledgeItems } from "@hyperidle/db"; export const q = (db: any) => db.select().from(knowledgeItems);',
		);
		// Nested file touches an UNMAPPED known table (bets) → 1 completeness finding.
		writeFixture(
			root,
			"packages/agent-orchestration/context-assembly/src/bets.ts",
			'import { bets } from "@hyperidle/db"; export const q = (db: any) => db.insert(bets);',
		);
		const findings = inspect(root);
		// leak.ts: 1 (foreign .from) + 1 (value import) = 2; bets.ts: 1 + 1 = 2 → 4 total.
		if (findings.length !== 4) {
			throw new Error(
				`table-ownership-guard: expected 4 findings (foreign access + import + 2 completeness), got ${findings.length}: ${JSON.stringify(findings)}`,
			);
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
	}

	// (2) Barrel re-export of a raw table → finding.
	const barrelRoot = mkdtempSync(join(tmpdir(), "au19-table-guard-barrel-"));
	try {
		writeFixture(barrelRoot, "packages/db/src/schema.ts", FIXTURE_SCHEMA);
		writeFixture(
			barrelRoot,
			"packages/core-api/knowledge/package.json",
			'{ "name": "@hyperidle/knowledge" }',
		);
		writeFixture(
			barrelRoot,
			"packages/core-api/knowledge/src/index.ts",
			'export { knowledgeItems } from "@hyperidle/db";',
		);
		const findings = inspect(barrelRoot);
		if (!findings.some((f) => f.reason.includes("barrel re-exports raw table"))) {
			throw new Error("table-ownership-guard: barrel re-export of a raw table was not caught");
		}
	} finally {
		rmSync(barrelRoot, { recursive: true, force: true });
	}

	process.stdout.write("table-ownership-guard fixtures: PASS\n");
}

if (process.argv.includes("--fixtures")) {
	fixtureCheck();
} else {
	const findings = inspect(process.cwd());
	for (const f of findings) process.stderr.write(`${f.file}: ${f.reason}\n`);
	if (findings.length > 0) {
		process.stderr.write(`table-ownership-guard: ${findings.length} finding(s)\n`);
		process.exit(1);
	}
	process.stdout.write("table-ownership-guard: PASS\n");
}
