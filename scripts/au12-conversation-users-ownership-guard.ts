#!/usr/bin/env tsx
/**
 * AU12 write-ownership guard: `threads`, `messages`, and `users` rows may be
 * written (`insert`/`update`/`delete`) only by the two owning modules —
 * `services/conversation-store.ts` (threads + messages) and
 * `services/user-store.ts` (users). Every other production file under
 * `packages/server/src` must route its writes through those stores.
 *
 * This is a NEW guard SHAPE — a *write-expression* guard, distinct from the
 * au9/au10/au11 *import/module-reachability* guards (whose CLI scaffolding it
 * reuses). It does not ban importing the table objects (reads —
 * `db.select().from(threads)` — stay legal and are pervasive). It matches the
 * write EXPRESSION: an `insert`/`update`/`delete` call whose first argument
 * resolves to one of the three table objects imported from `@hyperidle/db`.
 *
 * Two reference forms both resolve to the same table objects and are both
 * flagged:
 *   1. bare identifier from a named import — `import { threads } from
 *      "@hyperidle/db"` → `db.insert(threads)`.
 *   2. namespace member access — `import * as schema from "@hyperidle/db"` →
 *      `db.insert(schema.threads)` (the namespace-access bypass).
 * Resolving to the import (not string-matching the name) avoids false
 * positives on a local var coincidentally named `threads`.
 *
 * A green `--check` (zero findings) is the AC-4 proof within the guard's
 * enforceable scope (`packages/server/src` production code). Writes outside
 * that scope (packages/db bootstrap/fixture, eval seeding, web dev script)
 * are the named §5a exceptions and are not scanned here.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, relative } from "node:path";
import ts from "typescript";

const SRC = "packages/server/src";
const DB_MODULE = "@hyperidle/db";
const OWNED_TABLES = new Set(["threads", "messages", "users"]);
const WRITE_METHODS = new Set(["insert", "update", "delete"]);

/** The two owning modules — the only files allowed to write these tables. */
const EXEMPT_FILES = new Set([
	"packages/server/src/services/conversation-store.ts",
	"packages/server/src/services/user-store.ts",
]);

interface Finding {
	readonly file: string;
	readonly line: number;
	readonly reason: string;
}

function walk(dir: string): string[] {
	if (!existsSync(dir)) return [];
	const out: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.name === "node_modules" || entry.name === "dist") continue;
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			out.push(...walk(full));
		} else if ([".ts", ".tsx"].includes(extname(entry.name))) {
			out.push(full);
		}
	}
	return out;
}

function productionFile(rel: string): boolean {
	return (
		!rel.includes("/__tests__/") &&
		!/\.(?:test|spec)\.tsx?$/.test(rel) &&
		!rel.includes(".integration.test.")
	);
}

/**
 * For one source file, collect:
 *  - `tableIdents`: local identifier names bound to a named import of one of
 *    the owned tables from `@hyperidle/db` (honouring `as` aliases).
 *  - `namespaceBindings`: local names bound to `import * as X from
 *    "@hyperidle/db"`.
 */
function collectReferences(ast: ts.SourceFile): {
	tableIdents: Set<string>;
	namespaceBindings: Set<string>;
} {
	const tableIdents = new Set<string>();
	const namespaceBindings = new Set<string>();
	for (const stmt of ast.statements) {
		if (!ts.isImportDeclaration(stmt)) continue;
		if (!ts.isStringLiteralLike(stmt.moduleSpecifier)) continue;
		if (stmt.moduleSpecifier.text !== DB_MODULE) continue;
		const clause = stmt.importClause;
		if (!clause?.namedBindings) continue;
		if (ts.isNamespaceImport(clause.namedBindings)) {
			namespaceBindings.add(clause.namedBindings.name.text);
		} else if (ts.isNamedImports(clause.namedBindings)) {
			for (const el of clause.namedBindings.elements) {
				// `import { threads as t }` → imported name = propertyName, local = name.
				const importedName = (el.propertyName ?? el.name).text;
				if (OWNED_TABLES.has(importedName)) tableIdents.add(el.name.text);
			}
		}
	}
	return { tableIdents, namespaceBindings };
}

/** True when `arg` resolves to an owned table object (bare or namespace form). */
function argIsOwnedTable(
	arg: ts.Expression,
	tableIdents: Set<string>,
	namespaceBindings: Set<string>,
): boolean {
	if (ts.isIdentifier(arg)) return tableIdents.has(arg.text);
	if (ts.isPropertyAccessExpression(arg) && ts.isIdentifier(arg.expression)) {
		return namespaceBindings.has(arg.expression.text) && OWNED_TABLES.has(arg.name.text);
	}
	return false;
}

export function inspect(root: string): Finding[] {
	const findings: Finding[] = [];
	for (const abs of walk(join(root, SRC))) {
		const rel = relative(root, abs).split("\\").join("/");
		if (!productionFile(rel)) continue;
		if (EXEMPT_FILES.has(rel)) continue;
		const text = readFileSync(abs, "utf8");
		const ast = ts.createSourceFile(abs, text, ts.ScriptTarget.Latest, true);
		const { tableIdents, namespaceBindings } = collectReferences(ast);
		if (tableIdents.size === 0 && namespaceBindings.size === 0) continue;

		const visit = (node: ts.Node): void => {
			if (
				ts.isCallExpression(node) &&
				ts.isPropertyAccessExpression(node.expression) &&
				WRITE_METHODS.has(node.expression.name.text) &&
				node.arguments.length > 0 &&
				argIsOwnedTable(node.arguments[0] as ts.Expression, tableIdents, namespaceBindings)
			) {
				const method = node.expression.name.text;
				const { line } = ast.getLineAndCharacterOfPosition(node.getStart(ast));
				findings.push({
					file: rel,
					line: line + 1,
					reason: `direct .${method}() on an owned table (threads/messages/users) — route through conversation-store/user-store (AU12 AC-1)`,
				});
			}
			ts.forEachChild(node, visit);
		};
		visit(ast);
	}
	return findings;
}

// --- fixtures self-test ---

function fixtureCheck(): void {
	const root = mkdtempSync(join(tmpdir(), "au12-guard-"));
	const sources: Record<string, string> = {
		// (a) db.insert(threads) in a route → finding.
		"packages/server/src/routes/bad-route.ts":
			'import { threads } from "@hyperidle/db"; export const f = (db: any) => db.insert(threads).values({});',
		// (b) tx.update(users) in a service → finding.
		"packages/server/src/services/bad-service.ts":
			'import { users } from "@hyperidle/db"; export const g = (tx: any) => tx.update(users).set({}).where(true);',
		// (c) ctx.db.insert(messages) in a tool → finding.
		"packages/server/src/tools/bad-tool.ts":
			'import { messages } from "@hyperidle/db"; export const h = (ctx: any) => ctx.db.insert(messages).values({});',
		// (d) same write inside conversation-store.ts / user-store.ts → NO finding (exempt owners).
		"packages/server/src/services/conversation-store.ts":
			'import { threads } from "@hyperidle/db"; export const owner = (db: any) => db.insert(threads).values({});',
		"packages/server/src/services/user-store.ts":
			'import { users } from "@hyperidle/db"; export const owner2 = (db: any) => db.update(users).set({}).where(true);',
		// (e) db.select().from(threads) (read) → NO finding.
		"packages/server/src/routes/read-route.ts":
			'import { threads } from "@hyperidle/db"; export const r = (db: any) => db.select().from(threads);',
		// (f) local const threads not imported from @hyperidle/db → NO finding.
		"packages/server/src/routes/local-shadow.ts":
			'const threads = { x: 1 }; export const s = (db: any) => db.insert(threads);',
		// (g) namespace-access bypass → finding.
		"packages/server/src/routes/namespace-bypass.ts":
			'import * as schema from "@hyperidle/db"; export const n = (db: any) => db.insert(schema.threads).values({});',
	};
	try {
		for (const [path, source] of Object.entries(sources)) {
			const abs = join(root, path);
			mkdirSync(dirname(abs), { recursive: true });
			writeFileSync(abs, source);
		}
		const found = new Set(inspect(root).map((f) => f.file));
		const mustFlag = [
			"packages/server/src/routes/bad-route.ts",
			"packages/server/src/services/bad-service.ts",
			"packages/server/src/tools/bad-tool.ts",
			"packages/server/src/routes/namespace-bypass.ts",
		];
		for (const f of mustFlag) {
			if (!found.has(f)) throw new Error(`fixture guard MISSED a violation: ${f}`);
		}
		const mustPass = [
			"packages/server/src/services/conversation-store.ts",
			"packages/server/src/services/user-store.ts",
			"packages/server/src/routes/read-route.ts",
			"packages/server/src/routes/local-shadow.ts",
		];
		for (const f of mustPass) {
			if (found.has(f)) throw new Error(`fixture guard FALSE-POSITIVE on clean code: ${f}`);
		}
		process.stdout.write("au12-conversation-users-ownership-guard fixtures: PASS\n");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

if (process.argv.includes("--fixtures")) {
	fixtureCheck();
} else {
	const findings = inspect(process.cwd());
	for (const finding of findings) {
		process.stderr.write(`${finding.file}:${finding.line}: ${finding.reason}\n`);
	}
	if (findings.length > 0) {
		process.stderr.write(`au12-conversation-users-ownership-guard: ${findings.length} finding(s)\n`);
		process.exit(1);
	}
	process.stdout.write("au12-conversation-users-ownership-guard: PASS\n");
}
