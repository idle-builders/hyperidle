#!/usr/bin/env tsx
/**
 * AU18 §2.3 guard: `notificationQueue` may only be referenced (read OR
 * write, including join position) from `packages/server/src/notifications/
 * notification-queue.ts` — the single repository owning every
 * `notification_queue` row — or that module's own test file.
 *
 * Cloned from `au13-work-routine-ownership-guard.ts`'s repo-wide AST-scan +
 * `--fixtures` self-test shape. One difference from AU13 (which maps
 * multiple tables to multiple owning service files): AU18 has exactly ONE
 * table and ONE owning file — every other production or test file in
 * `packages/server/src` is disallowed, zero exceptions (AU18 §2.3, §8 AC-1/
 * AC-6a/AC-7).
 *
 * Matches `.from`/.insert`/`.update`/`.delete` (direct access) AND
 * `.leftJoin`/`.innerJoin`/`.rightJoin`/`.fullJoin` (join position) calls
 * whose first argument is the bare identifier `notificationQueue` — the
 * join-method matcher closes the AU14-round-2-style future-evasion hole
 * (a read written as `.from(x).innerJoin(notificationQueue, …)` would
 * otherwise dodge a `.from`-only matcher) and is also AC-7's enforcement:
 * `notificationQueue` never legally appears in join position at all (every
 * verified call site is single-table — AU18 plan §1b) — so ANY join hit is
 * automatically a violation, not just a same-file-mismatch.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, relative } from "node:path";
import ts from "typescript";

const SRC_ROOTS = ["packages/core-app/src", "packages/agent-layer/src", "packages/server/src"] as const;

/** The one table this guard protects. */
const GUARDED_TABLE = "notificationQueue";

/** The one file permitted to reference GUARDED_TABLE. */
const OWNING_FILE = "packages/core-app/src/notifications/notification-queue.ts";

/** The owning module's own test file(s) — e.g. `notification-queue.integration.test.ts`. */
const OWNING_TEST_FILE_PATTERN = /^notification-queue\..*\.test\.ts$/;

const DIRECT_ACCESS_METHODS = new Set(["from", "insert", "update", "delete"]);
const JOIN_METHODS = new Set(["leftJoin", "innerJoin", "rightJoin", "fullJoin"]);
const GUARDED_METHODS = new Set([...DIRECT_ACCESS_METHODS, ...JOIN_METHODS]);

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

/** The owning file itself, or its own test file (co-located or under any `__tests__` dir). */
function isAllowlisted(rel: string): boolean {
	if (rel === OWNING_FILE) return true;
	return OWNING_TEST_FILE_PATTERN.test(basename(rel));
}

/**
 * Scan a single file's AST for `<expr>.from(notificationQueue, ...)` /
 * `.insert(notificationQueue, ...)` / `.update(notificationQueue, ...)` /
 * `.delete(notificationQueue, ...)` / `.leftJoin(notificationQueue, ...)` /
 * `.innerJoin(notificationQueue, ...)` / `.rightJoin(notificationQueue, ...)` /
 * `.fullJoin(notificationQueue, ...)` call shapes where the first argument
 * is the bare identifier `notificationQueue`.
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
					reason: `direct .${node.expression.name.text}(${GUARDED_TABLE}) access — route through notification-queue.ts (AU18)`,
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
	const allFiles = SRC_ROOTS.flatMap((srcRoot) => walk(join(root, srcRoot)));

	for (const abs of new Set(allFiles)) {
		const rel = relative(root, abs).split("\\").join("/");
		if (isAllowlisted(rel)) continue;
		findings.push(...findViolations(abs, rel));
	}

	return findings;
}

// --- fixtures self-test ---

function writeFixture(root: string, rel: string, source: string): void {
	const abs = join(root, rel);
	mkdirSync(dirname(abs), { recursive: true });
	writeFileSync(abs, source);
}

function fixtureCheck(): void {
	// (1) Combined non-owning-file fixture: 4 true violations (.from/.insert/
	// .update direct access + a join-position read) coexisting with 2 legal
	// calls (a write to an unrelated table; a join whose arg is NOT
	// notificationQueue).
	const combinedRoot = mkdtempSync(join(tmpdir(), "au18-notif-guard-combined-"));
	try {
		writeFixture(
			combinedRoot,
			"packages/server/src/routes/bad-notifications-route.ts",
			[
				'import { items, notificationQueue, propagationLog } from "@hyperidle/db";',
				"type Db = {",
				"  select: () => { from: (t: unknown) => { innerJoin: (t2: unknown, c: unknown) => unknown } };",
				"  insert: (t: unknown) => { values: (v: unknown) => Promise<void> };",
				"  update: (t: unknown) => { set: (v: unknown) => { where: (w: unknown) => Promise<void> } };",
				"};",
				"export async function violateRead(db: Db) {",
				"  await db.select().from(notificationQueue);", // (a) direct .from — VIOLATION
				"}",
				"export async function violateInsert(db: Db) {",
				"  await db.insert(notificationQueue).values({});", // (b) direct .insert — VIOLATION
				"}",
				"export async function violateUpdate(db: Db) {",
				"  await db.update(notificationQueue).set({}).where(true);", // (c) direct .update — VIOLATION
				"}",
				"export async function violateJoin(db: Db) {",
				// (d) join-position raw read — AC-7 close — VIOLATION
				"  await db.select().from(items).innerJoin(notificationQueue, true);",
				"}",
				"export async function legalPropagationWrite(db: Db) {",
				"  await db.insert(propagationLog).values({});", // legal — unrelated table
				"}",
				"export async function legalUnrelatedJoin(db: Db) {",
				// legal — join arg is NOT notificationQueue
				"  await db.select().from(items).leftJoin(propagationLog, true);",
				"}",
			].join("\n"),
		);

		const findings = inspect(combinedRoot);
		if (findings.length !== 4) {
			throw new Error(
				`fixture guard expected exactly 4 findings (from/insert/update/join violations), got ${findings.length}`,
			);
		}
	} finally {
		rmSync(combinedRoot, { recursive: true, force: true });
	}

	// (2) File-scoping proof (positive case): the SAME violating shapes,
	// written into the owning module (notification-queue.ts) AND its own
	// test file, produce ZERO findings — `inspect()` allowlists exactly
	// those two paths.
	const scopingRoot = mkdtempSync(join(tmpdir(), "au18-notif-guard-scoping-"));
	try {
		const owningSource =
			'import { notificationQueue } from "@hyperidle/db"; export async function findById(db: unknown) { const d = db as { select: () => { from: (t: unknown) => unknown } }; return d.select().from(notificationQueue); }';
		writeFixture(scopingRoot, OWNING_FILE, owningSource);
		writeFixture(
			scopingRoot,
			"packages/server/src/__tests__/notifications/notification-queue.integration.test.ts",
			owningSource,
		);
		const findings = inspect(scopingRoot);
		if (findings.length > 0) {
			throw new Error(
				`fixture guard incorrectly flagged the owning module or its own test file: found ${findings.length} finding(s)`,
			);
		}
	} finally {
		rmSync(scopingRoot, { recursive: true, force: true });
	}

	// (3) A test file for a DIFFERENT domain (not notification-queue's own)
	// referencing notificationQueue directly is still a violation — the
	// allowlist is scoped to the owning module's OWN test, not "any test".
	const wrongTestRoot = mkdtempSync(join(tmpdir(), "au18-notif-guard-wrong-test-"));
	try {
		writeFixture(
			wrongTestRoot,
			"packages/server/src/__tests__/notifications/dispatcher.test.ts",
			'import { notificationQueue } from "@hyperidle/db"; export async function f(db: unknown) { const d = db as { select: () => { from: (t: unknown) => unknown } }; return d.select().from(notificationQueue); }',
		);
		const findings = inspect(wrongTestRoot);
		if (findings.length !== 1) {
			throw new Error(
				`fixture guard should flag a non-owning test file referencing notificationQueue directly; got ${findings.length} finding(s)`,
			);
		}
	} finally {
		rmSync(wrongTestRoot, { recursive: true, force: true });
	}

	// (4) Clean tree (no notificationQueue access at all outside the owner) → zero findings.
	const cleanRoot = mkdtempSync(join(tmpdir(), "au18-notif-guard-clean-"));
	try {
		writeFixture(
			cleanRoot,
			"packages/server/src/services/unrelated.ts",
			'import { propagationLog } from "@hyperidle/db"; export async function ok(db: unknown) { await (db as { insert: (t: unknown) => { values: (v: unknown) => Promise<void> } }).insert(propagationLog).values({}); }',
		);
		const findings = inspect(cleanRoot);
		if (findings.length > 0) {
			throw new Error(`fixture guard false-positived on a clean tree`);
		}
	} finally {
		rmSync(cleanRoot, { recursive: true, force: true });
	}

	process.stdout.write("au18-notification-ownership-guard fixtures: PASS\n");
}

if (process.argv.includes("--fixtures")) {
	fixtureCheck();
} else {
	const findings = inspect(process.cwd());
	for (const finding of findings) process.stderr.write(`${finding.file}: ${finding.reason}\n`);
	if (findings.length > 0) {
		process.stderr.write(`au18-notification-ownership-guard: ${findings.length} finding(s)\n`);
		process.exit(1);
	}
	process.stdout.write("au18-notification-ownership-guard: PASS\n");
}
