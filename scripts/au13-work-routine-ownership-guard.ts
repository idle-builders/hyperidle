#!/usr/bin/env tsx
/**
 * AU13 AC1/AC4 guard: `bets`, `tasks`, `items`, `routines`, `routineRuns`
 * may only be written (`insert`/`update`/`delete`) from their owning
 * service module — `packages/server/src/work-service.ts` (bets/tasks/items)
 * or `packages/server/src/routine-service.ts` (routines/routineRuns).
 *
 * Cloned from `au11-runtime-ownership-guard.ts`'s AST-scan + `--fixtures`
 * self-test shape. Unlike AU11's import-reachability walk, this is a flat
 * per-file AST scan (write-scoped, not import-scoped — plan §3: a literal
 * import-ban would also force every SELECT through the service, no
 * behavior-preservation value). Every production `.ts`/`.tsx` file under
 * `packages/server/src` (excluding tests) is scanned for a `CallExpression`
 * whose callee is `<identifier>.insert` / `.update` / `.delete` and whose
 * first argument is one of the five table identifiers — findings outside
 * the two owning-module files fail the check.
 *
 * Reads stay legal (`.select(...)`) — this is a write-only scan. The
 * deferred `threads` insert inside `builtin-routine-handlers.ts` (AU12
 * handoff, plan §6) never trips this guard: `threads` is not one of the
 * five owned tables.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, relative } from "node:path";
import ts from "typescript";

const SRC = "packages/server/src";

/** The five tables this guard protects, and which service owns each. */
const TABLE_OWNER: Record<string, "Work" | "Routine"> = {
	bets: "Work",
	tasks: "Work",
	items: "Work",
	routines: "Routine",
	routineRuns: "Routine",
};

const WRITE_METHODS = new Set(["insert", "update", "delete"]);

/** Only these two files may contain a direct write call against the five tables. */
const OWNING_MODULE_ALLOWLIST = new Set([
	"packages/server/src/work-service.ts",
	"packages/server/src/routine-service.ts",
]);

interface Finding {
	readonly file: string;
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
 * Scan a single file's AST for `<expr>.insert(<table>, ...)` /
 * `.update(<table>, ...)` / `.delete(<table>, ...)` call shapes where
 * `<table>` is a bare identifier naming one of the five owned tables.
 */
function findWriteViolations(abs: string, rel: string): Finding[] {
	const text = readFileSync(abs, "utf8");
	const ast = ts.createSourceFile(abs, text, ts.ScriptTarget.Latest, true);
	const findings: Finding[] = [];

	const visit = (node: ts.Node): void => {
		if (
			ts.isCallExpression(node) &&
			ts.isPropertyAccessExpression(node.expression) &&
			WRITE_METHODS.has(node.expression.name.text)
		) {
			const firstArg = node.arguments[0];
			if (firstArg && ts.isIdentifier(firstArg) && firstArg.text in TABLE_OWNER) {
				const table = firstArg.text;
				const owner = TABLE_OWNER[table];
				findings.push({
					file: rel,
					reason: `direct write to ${table} — route through ${owner} service (AU13/AU8 TABLE_OWNER)`,
				});
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(ast);
	return findings;
}

export function inspect(root: string): Finding[] {
	const findings: Finding[] = [];
	const allProdFiles = walk(join(root, SRC)).filter((abs) => productionFile(relative(root, abs)));

	for (const abs of new Set(allProdFiles)) {
		const rel = relative(root, abs).split("\\").join("/");
		if (OWNING_MODULE_ALLOWLIST.has(rel)) continue;
		findings.push(...findWriteViolations(abs, rel));
	}

	return findings;
}

// --- fixtures self-test ---

function fixtureCheck(): void {
	const root = mkdtempSync(join(tmpdir(), "au13-guard-"));
	const sources: Record<string, string> = {
		// (a) direct write to a guarded table from a non-owning file → finding.
		"packages/server/src/routes/bad-route.ts":
			'import { bets } from "@hyperidle/db"; export async function f(db: unknown) { await (db as { insert: (t: unknown) => { values: (v: unknown) => Promise<void> } }).insert(bets).values({}); }',
		// (b) same shape, but reads (.select) are always legal.
		"packages/server/src/routes/ok-read.ts":
			'import { bets } from "@hyperidle/db"; export async function g(db: unknown) { await (db as { select: () => { from: (t: unknown) => unknown } }).select().from(bets); }',
		// (c) the owning module itself may write freely.
		"packages/server/src/work-service.ts":
			'import { bets } from "@hyperidle/db"; export async function createBet(db: unknown) { await (db as { insert: (t: unknown) => { values: (v: unknown) => Promise<void> } }).insert(bets).values({}); }',
		// (d) a write to an unrelated table (not one of the five) never trips the guard.
		"packages/server/src/services/unrelated.ts":
			'import { threads } from "@hyperidle/db"; export async function h(tx: unknown) { await (tx as { insert: (t: unknown) => { values: (v: unknown) => Promise<void> } }).insert(threads).values({}); }',
		// (e) routine-service.ts may write routines/routineRuns freely.
		"packages/server/src/routine-service.ts":
			'import { routines } from "@hyperidle/db"; export async function insertRoutine(db: unknown) { await (db as { insert: (t: unknown) => { values: (v: unknown) => Promise<void> } }).insert(routines).values({}); }',
		// (f) a direct write to routines from a non-owning file → finding.
		"packages/server/src/services/bad-scheduler.ts":
			'import { routines } from "@hyperidle/db"; export async function j(db: unknown) { await (db as { update: (t: unknown) => { set: (v: unknown) => { where: (w: unknown) => Promise<void> } } }).update(routines).set({}).where(true); }',
	};
	try {
		for (const [path, source] of Object.entries(sources)) {
			const abs = join(root, path);
			mkdirSync(dirname(abs), { recursive: true });
			writeFileSync(abs, source);
		}
		const findings = inspect(root).map((f) => f.file);
		for (const expected of [
			"packages/server/src/routes/bad-route.ts",
			"packages/server/src/services/bad-scheduler.ts",
		])
			if (!findings.includes(expected)) throw new Error(`fixture guard missed ${expected}`);
		for (const allowed of [
			"packages/server/src/routes/ok-read.ts",
			"packages/server/src/work-service.ts",
			"packages/server/src/services/unrelated.ts",
			"packages/server/src/routine-service.ts",
		])
			if (findings.includes(allowed)) throw new Error(`fixture guard rejected allowed ${allowed}`);
		process.stdout.write("au13-work-routine-ownership-guard fixtures: PASS\n");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

if (process.argv.includes("--fixtures")) {
	fixtureCheck();
} else {
	const findings = inspect(process.cwd());
	for (const finding of findings) process.stderr.write(`${finding.file}: ${finding.reason}\n`);
	if (findings.length > 0) {
		process.stderr.write(`au13-work-routine-ownership-guard: ${findings.length} finding(s)\n`);
		process.exit(1);
	}
	process.stdout.write("au13-work-routine-ownership-guard: PASS\n");
}
