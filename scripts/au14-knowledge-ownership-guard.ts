#!/usr/bin/env tsx
/**
 * AU14 round 2 AC-6 guard: `packages/server/src/routes/knowledge.ts` may
 * perform ZERO direct `knowledgeItems` table access of any kind — every
 * read AND write must route through `knowledge/knowledge-repository.ts`.
 *
 * Cloned from `au13-work-routine-ownership-guard.ts`'s AST-scan +
 * `--fixtures` self-test shape, generalized per
 * plans/AU14/architecture-round2.md §9:
 * - **File-scoped, not table-owner-map-scoped.** Unlike AU13 (5 tables
 *   owned repo-wide), this guard only checks ONE file
 *   (`routes/knowledge.ts`) against ONE table (`knowledgeItems`). 14+
 *   other server files legitimately touch `knowledgeItems` directly
 *   (attention-scoring, promotion-pipeline, practice-meeting, git-export,
 *   other routes, tools, …) — those are other domains' concerns, out of
 *   AU14's scope. A repo-wide TABLE_OWNER map is AU8's job.
 * - **Reads are in scope too**, not just writes — the four direct-access
 *   methods (`.from`/`.insert`/`.update`/`.delete`) AND the four join
 *   methods (`.leftJoin`/`.innerJoin`/`.rightJoin`/`.fullJoin`), matched
 *   whenever the first argument is the bare identifier `knowledgeItems`.
 *   The join methods close a future-evasion hole: a read written as
 *   `.from(knowledgeAppProjection).innerJoin(knowledgeItems, …)` touches
 *   `knowledgeItems` in join position and would evade a `.from`-only
 *   matcher entirely (round-2 critique W1).
 * - **Zero-allowlist.** No per-line carve-outs — the whole point of this
 *   round is that `routes/knowledge.ts` no longer touches the table at all.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import ts from "typescript";

/** The one file this guard protects. */
const GUARDED_FILE = "packages/server/src/routes/knowledge.ts";

/** The one table this guard protects against direct access from GUARDED_FILE. */
const GUARDED_TABLE = "knowledgeItems";

const DIRECT_ACCESS_METHODS = new Set(["from", "insert", "update", "delete"]);
const JOIN_METHODS = new Set(["leftJoin", "innerJoin", "rightJoin", "fullJoin"]);
const GUARDED_METHODS = new Set([...DIRECT_ACCESS_METHODS, ...JOIN_METHODS]);

interface Finding {
	readonly file: string;
	readonly reason: string;
}

/**
 * Scan a single file's AST for `<expr>.from(knowledgeItems, ...)` /
 * `.insert(knowledgeItems, ...)` / `.update(knowledgeItems, ...)` /
 * `.delete(knowledgeItems, ...)` / `.leftJoin(knowledgeItems, ...)` /
 * `.innerJoin(knowledgeItems, ...)` / `.rightJoin(knowledgeItems, ...)` /
 * `.fullJoin(knowledgeItems, ...)` call shapes where the first argument is
 * the bare identifier `knowledgeItems`.
 */
function findViolations(abs: string, rel: string): Finding[] {
	const text = readFileSync(abs, "utf8");
	const ast = ts.createSourceFile(abs, text, ts.ScriptTarget.Latest, true);
	const findings: Finding[] = [];

	const visit = (node: ts.Node): void => {
		if (
			ts.isCallExpression(node) &&
			ts.isPropertyAccessExpression(node.expression) &&
			GUARDED_METHODS.has(node.expression.name.text)
		) {
			const firstArg = node.arguments[0];
			if (firstArg && ts.isIdentifier(firstArg) && firstArg.text === GUARDED_TABLE) {
				findings.push({
					file: rel,
					reason: `direct .${node.expression.name.text}(${GUARDED_TABLE}) access — route through knowledge-repository.ts (AU14 round 2)`,
				});
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(ast);
	return findings;
}

export function inspect(root: string): Finding[] {
	const abs = join(root, GUARDED_FILE);
	if (!existsSync(abs)) return [];
	return findViolations(abs, GUARDED_FILE);
}

function writeFixture(root: string, rel: string, source: string): void {
	const abs = join(root, rel);
	mkdirSync(dirname(abs), { recursive: true });
	writeFileSync(abs, source);
}

/**
 * All fixture checks go through the REAL `inspect()` entry point (never the
 * inner `findViolations` directly) so the self-test proves what the guard
 * actually enforces at runtime: `inspect()` only ever reads GUARDED_FILE —
 * file-scoping is structural, not an allowlist findViolations must honor.
 */
function fixtureCheck(): void {
	// (1) Combined guarded-file fixture: 4 true violations (.from/.insert/
	// .update direct access + a join-position read) coexisting with 2 legal
	// calls (a write to an unrelated table; a join whose arg is NOT
	// knowledgeItems) — proves both true positives AND true negatives in one
	// realistic file, not just isolated shapes.
	const combinedRoot = mkdtempSync(join(tmpdir(), "au14-guard-combined-"));
	try {
		writeFixture(
			combinedRoot,
			GUARDED_FILE,
			[
				'import { knowledgeAccessLog, knowledgeAppProjection, knowledgeConflicts, knowledgeItems } from "@hyperidle/db";',
				"type Db = {",
				"  select: () => { from: (t: unknown) => { innerJoin: (t2: unknown, c: unknown) => unknown; leftJoin: (t2: unknown, c: unknown) => unknown } };",
				"  insert: (t: unknown) => { values: (v: unknown) => Promise<void> };",
				"  update: (t: unknown) => { set: (v: unknown) => { where: (w: unknown) => Promise<void> } };",
				"};",
				"export async function violateRead(db: Db) {",
				"  await db.select().from(knowledgeItems);", // (a) direct .from — VIOLATION
				"}",
				"export async function violateInsert(db: Db) {",
				"  await db.insert(knowledgeItems).values({});", // (b) direct .insert — VIOLATION
				"}",
				"export async function violateUpdate(db: Db) {",
				"  await db.update(knowledgeItems).set({}).where(true);", // (c) direct .update — VIOLATION
				"}",
				"export async function violateJoin(db: Db) {",
				// (d) join-position raw read — the W1 fix target — VIOLATION
				"  await db.select().from(knowledgeAppProjection).innerJoin(knowledgeItems, true);",
				"}",
				"export async function legalAccessLogWrite(db: Db) {",
				"  await db.insert(knowledgeAccessLog).values({});", // legal — unrelated table
				"}",
				"export async function legalUnrelatedJoin(db: Db) {",
				// legal — join arg is NOT knowledgeItems
				"  await db.select().from(knowledgeAppProjection).leftJoin(knowledgeConflicts, true);",
				"}",
			].join("\n"),
		);

		const findings = inspect(combinedRoot);
		if (findings.length !== 4) {
			throw new Error(
				`fixture guard expected exactly 4 findings (from/insert/update/join violations) in ${GUARDED_FILE}, got ${findings.length}`,
			);
		}
	} finally {
		rmSync(combinedRoot, { recursive: true, force: true });
	}

	// (2) File-scoping proof: the SAME violating shapes, written into the
	// OWNING module (knowledge-repository.ts) instead of GUARDED_FILE, must
	// produce ZERO findings — `inspect()` never reads any file other than
	// GUARDED_FILE, so the owning module (and every other of the 14+ other
	// files that legitimately touch knowledgeItems) is structurally exempt.
	const scopingRoot = mkdtempSync(join(tmpdir(), "au14-guard-scoping-"));
	try {
		writeFixture(
			scopingRoot,
			"packages/server/src/knowledge/knowledge-repository.ts",
			'import { knowledgeAppProjection, knowledgeItems } from "@hyperidle/db"; export async function findById(db: unknown) { const d = db as { select: () => { from: (t: unknown) => { innerJoin: (t2: unknown, c: unknown) => unknown } } }; return d.select().from(knowledgeAppProjection).innerJoin(knowledgeItems, true); }',
		);
		// No GUARDED_FILE written in this root at all.
		const findings = inspect(scopingRoot);
		if (findings.length > 0) {
			throw new Error(
				`fixture guard incorrectly scanned a file other than ${GUARDED_FILE}: found ${findings.length} finding(s)`,
			);
		}
	} finally {
		rmSync(scopingRoot, { recursive: true, force: true });
	}

	// (3) Clean guarded file (no knowledgeItems access at all) → zero findings.
	const cleanRoot = mkdtempSync(join(tmpdir(), "au14-guard-clean-"));
	try {
		writeFixture(
			cleanRoot,
			GUARDED_FILE,
			'import { knowledgeAccessLog } from "@hyperidle/db"; export async function ok(db: unknown) { await (db as { insert: (t: unknown) => { values: (v: unknown) => Promise<void> } }).insert(knowledgeAccessLog).values({}); }',
		);
		const findings = inspect(cleanRoot);
		if (findings.length > 0) {
			throw new Error(`fixture guard false-positived on a clean ${GUARDED_FILE}`);
		}
	} finally {
		rmSync(cleanRoot, { recursive: true, force: true });
	}

	process.stdout.write("au14-knowledge-ownership-guard fixtures: PASS\n");
}

if (process.argv.includes("--fixtures")) {
	fixtureCheck();
} else {
	const findings = inspect(process.cwd());
	for (const finding of findings) process.stderr.write(`${finding.file}: ${finding.reason}\n`);
	if (findings.length > 0) {
		process.stderr.write(`au14-knowledge-ownership-guard: ${findings.length} finding(s)\n`);
		process.exit(1);
	}
	process.stdout.write("au14-knowledge-ownership-guard: PASS\n");
}
