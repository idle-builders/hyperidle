#!/usr/bin/env tsx
/**
 * AU12 full-access ownership guard: `threads`, `messages`, and `users` may be
 * read OR written only by the two owning modules —
 * `services/conversation-store.ts` (threads + messages) and
 * `services/user-store.ts` (users). Every other production file under
 * `packages/server/src` must route ALL access (select/insert/update/delete,
 * joins, column refs, and `sql\`\`` interpolations) through those stores.
 *
 * This is a *reference* guard: it flags ANY reference to an owned table object
 * imported from `@hyperidle/db`, in either form —
 *   1. bare identifier from a named import — `import { threads } from
 *      "@hyperidle/db"` → `db.select().from(threads)`, `eq(threads.id, …)`,
 *      `.innerJoin(threads, …)`, `` sql`${threads.participants} LIKE …` ``.
 *   2. namespace member access — `import * as schema from "@hyperidle/db"` →
 *      `schema.threads` (the namespace-access bypass).
 * Resolving to the *value* import (not string-matching the name) keeps a local
 * `const threads = …` and a `import type { Thread }` legal — only the actual
 * `@hyperidle/db` table object is owned.
 *
 * A green `--check` (zero findings) is the AC-4 proof within the guard's
 * enforceable scope (`packages/server/src` production code). Access outside
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

const FINDING_REASON =
	"direct reference to an owned table (threads/messages/users) — route through conversation-store/user-store (AU12)";

/** True when `node` is the local binding inside an import declaration (not a use-site). */
function isImportBinding(node: ts.Identifier): boolean {
	const p = node.parent;
	return (
		ts.isImportSpecifier(p) ||
		ts.isImportClause(p) ||
		ts.isNamespaceImport(p) ||
		ts.isNamedImports(p)
	);
}

/**
 * True when `node` sits in a NAME position that does not reference the imported
 * value: a member access (`obj.node`), an object-literal key (`{ node: … }`), a
 * type/interface property or method signature (`{ node: T }`), an enum member,
 * a binding property name, or a qualified type name (`ns.node`). A shorthand
 * property (`{ node }`) IS a value reference, so it is NOT skipped.
 */
function isMemberOrKeyPosition(node: ts.Identifier): boolean {
	const p = node.parent;
	if (ts.isPropertyAccessExpression(p) && p.name === node) return true;
	if (ts.isPropertyAssignment(p) && p.name === node) return true;
	if (ts.isPropertySignature(p) && p.name === node) return true;
	if (ts.isMethodSignature(p) && p.name === node) return true;
	if (ts.isMethodDeclaration(p) && p.name === node) return true;
	if (ts.isPropertyDeclaration(p) && p.name === node) return true;
	if (ts.isEnumMember(p) && p.name === node) return true;
	if (ts.isBindingElement(p) && p.propertyName === node) return true;
	if (ts.isQualifiedName(p) && p.right === node) return true;
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

		const reportedLines = new Set<number>();
		const report = (node: ts.Node): void => {
			const { line } = ast.getLineAndCharacterOfPosition(node.getStart(ast));
			if (reportedLines.has(line)) return;
			reportedLines.add(line);
			findings.push({ file: rel, line: line + 1, reason: FINDING_REASON });
		};

		const visit = (node: ts.Node): void => {
			// namespace-member bypass: `schema.threads`
			if (
				ts.isPropertyAccessExpression(node) &&
				ts.isIdentifier(node.expression) &&
				namespaceBindings.has(node.expression.text) &&
				OWNED_TABLES.has(node.name.text)
			) {
				report(node);
				return;
			}
			// bare identifier bound to an owned-table value import
			if (
				ts.isIdentifier(node) &&
				tableIdents.has(node.text) &&
				!isImportBinding(node) &&
				!isMemberOrKeyPosition(node)
			) {
				report(node);
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
		// (a) db.insert(threads) in a route → finding (write subsumed by the reference guard).
		"packages/server/src/routes/bad-route.ts":
			'import { threads } from "@hyperidle/db"; export const f = (db: any) => db.insert(threads).values({});',
		// (b) tx.update(users) in a service → finding.
		"packages/server/src/services/bad-service.ts":
			'import { users } from "@hyperidle/db"; export const g = (tx: any) => tx.update(users).set({}).where(true);',
		// (c) ctx.db.insert(messages) in a tool → finding.
		"packages/server/src/tools/bad-tool.ts":
			'import { messages } from "@hyperidle/db"; export const h = (ctx: any) => ctx.db.insert(messages).values({});',
		// (d) any access inside conversation-store.ts / user-store.ts → NO finding (exempt owners).
		"packages/server/src/services/conversation-store.ts":
			'import { threads } from "@hyperidle/db"; export const owner = (db: any) => db.select().from(threads);',
		"packages/server/src/services/user-store.ts":
			'import { users } from "@hyperidle/db"; export const owner2 = (db: any) => db.select().from(users);',
		// (e→h) db.select().from(threads) (READ) → NOW a finding (the write-only guard's NO-finding is inverted).
		"packages/server/src/routes/read-route.ts":
			'import { threads } from "@hyperidle/db"; export const r = (db: any) => db.select().from(threads);',
		// (f) local const threads not imported from @hyperidle/db → NO finding.
		"packages/server/src/routes/local-shadow.ts":
			'const threads = { x: 1 }; export const s = () => threads.x;',
		// (g) namespace-access bypass (read) → finding.
		"packages/server/src/routes/namespace-bypass.ts":
			'import * as schema from "@hyperidle/db"; export const n = (db: any) => db.select().from(schema.threads);',
		// (i) column reference in a where → finding.
		"packages/server/src/routes/col-ref.ts":
			'import { users } from "@hyperidle/db"; import { eq } from "drizzle-orm"; export const i = (db: any, x: string) => db.select().from(sessions).where(eq(users.id, x));',
		// (j) join on an owned table → finding.
		"packages/server/src/routes/join-ref.ts":
			'import { messages } from "@hyperidle/db"; export const j = (db: any) => db.select().from(sessions).innerJoin(messages, true);',
		// (l) TYPE-ONLY import used as an annotation → NO finding (type export, not the table object).
		"packages/server/src/routes/type-only.ts":
			'import type { User } from "@hyperidle/db"; export const l = (u: User) => u;',
		// (m) SHADOW NAME: no @hyperidle/db value import, local const users → NO finding.
		"packages/server/src/routes/shadow-name.ts":
			'const users = [1, 2, 3]; export const m = () => users.length;',
		// (n) RAW-SQL: owned column spliced into a tagged template → finding.
		"packages/server/src/routes/raw-sql.ts":
			'import { threads } from "@hyperidle/db"; import { sql } from "drizzle-orm"; export const nn = (p: string) => sql`${threads.participants} LIKE ${p}`;',
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
			"packages/server/src/routes/read-route.ts",
			"packages/server/src/routes/namespace-bypass.ts",
			"packages/server/src/routes/col-ref.ts",
			"packages/server/src/routes/join-ref.ts",
			"packages/server/src/routes/raw-sql.ts",
		];
		for (const f of mustFlag) {
			if (!found.has(f)) throw new Error(`fixture guard MISSED a violation: ${f}`);
		}
		const mustPass = [
			"packages/server/src/services/conversation-store.ts",
			"packages/server/src/services/user-store.ts",
			"packages/server/src/routes/local-shadow.ts",
			"packages/server/src/routes/type-only.ts",
			"packages/server/src/routes/shadow-name.ts",
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
