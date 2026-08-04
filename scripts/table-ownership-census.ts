#!/usr/bin/env tsx
/**
 * AU26 D0 — the table-ownership census (AC14). **Reporting only. Always exits 0.**
 *
 * Prints every file×table pair that violates the table-ownership ACL under AU26's
 * TARGET scope:
 *   - scan roots = `src/` of every package under `packages/` carrying a
 *     `package.json` (architecture §D-G: "the ACL governs every non-test file in
 *     the workspace" — no dependency closure, no package name, no role);
 *   - `UNOWNED_SHARED_TABLES` deleted — the four exempt tables get real owners;
 *   - AU26's four new `TABLE_OWNER` rows applied on top of the guard's own map.
 *
 * @lore AU26 D0: this script exists because the round-2 census was wrong by 88
 * pairs and nothing measured it (the AU20 lesson: gate on the goal metric, not on
 * green). It deliberately does NOT fail the build — the guard's enforced scope
 * stays exactly where it is until increment D2 flips it — so that every increment
 * from D0 on can quote a number that must strictly decrease: 100 → 91 (D2a) → 75
 * (D1) → 6 (D2b) → 0 (D2).
 *
 * It shares `checkAccess` with `scripts/table-ownership-guard.ts` rather than
 * reimplementing it: a census that re-declared the ACL would drift from the rule
 * it measures, and the number is this WP's goal metric.
 *
 *   npx tsx scripts/table-ownership-census.ts
 */
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	type AccessFinding,
	type OwnershipPolicy,
	TABLE_OWNER,
	checkAccess,
	collectSourceFiles,
	knownTables,
} from "./table-ownership-guard.js";

/**
 * The four owners AU26 assigns to the tables `UNOWNED_SHARED_TABLES` exempts today
 * (architecture §D-G). Increments D1 and D2 land them in the guard for real.
 */
export const AU26_TABLE_OWNER_ADDITIONS: Record<string, string> = {
	sessions: "packages/agent-orchestration/run-orchestration",
	propagationLog: "packages/core-api/policy",
	taskDispatchAttempts: "packages/core-api/work",
	userSkills: "packages/core-api/users",
};

/** Target policy: the guard's map plus AU26's four rows, and no exemption set. */
export function targetPolicy(): OwnershipPolicy {
	return {
		owner: { ...TABLE_OWNER, ...AU26_TABLE_OWNER_ADDITIONS },
		exempt: new Set<string>(),
	};
}

export interface CensusPair {
	readonly file: string;
	readonly table: string;
	readonly owner: string;
}

export interface CensusArea {
	readonly area: string;
	readonly pairs: number;
	readonly files: number;
}

export interface CensusTable {
	readonly table: string;
	readonly pairs: number;
	readonly owner: string;
}

export interface CensusResult {
	readonly filesScanned: number;
	readonly findings: number;
	readonly pairs: readonly CensusPair[];
	readonly filesWithFindings: number;
	readonly tables: number;
	readonly byArea: readonly CensusArea[];
	readonly byTable: readonly CensusTable[];
	readonly detail: readonly AccessFinding[];
}

/**
 * Every package `src/` in the workspace — `packages/<pkg>/src` and
 * `packages/<layer>/<service>/src`, for any directory carrying a `package.json`.
 * No package name appears here and no dependency graph is read, so a package added
 * tomorrow is counted by default.
 */
export function workspaceSourceRoots(root: string): string[] {
	const packagesDir = join(root, "packages");
	const roots: string[] = [];
	if (!existsSync(packagesDir)) return roots;
	const walk = (dir: string, depth: number): void => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			if (!entry.isDirectory()) continue;
			if (entry.name === "node_modules" || entry.name === "dist") continue;
			const abs = join(dir, entry.name);
			if (existsSync(join(abs, "package.json"))) roots.push(join(abs, "src"));
			if (depth < 1) walk(abs, depth + 1);
		}
	};
	walk(packagesDir, 0);
	return roots;
}

/** The §D-G region a file belongs to, so the report reads region for region. */
function areaOf(file: string): string {
	if (file.startsWith("packages/eval/")) return "packages/eval/src";
	if (file.startsWith("packages/db/")) return "packages/db/src";
	if (file.startsWith("packages/core-api/src")) return "packages/core-api/src (Layer)";
	return file.split("/").slice(0, 3).join("/");
}

export function runCensus(root: string): CensusResult {
	const tables = knownTables(root);
	const policy = targetPolicy();

	const files = new Set<string>();
	for (const srcRoot of workspaceSourceRoots(root)) {
		for (const abs of collectSourceFiles(srcRoot)) files.add(abs);
	}

	const detail: AccessFinding[] = [];
	for (const abs of [...files].sort()) {
		detail.push(...checkAccess(root, abs, tables, policy));
	}

	const pairSet = new Map<string, CensusPair>();
	for (const f of detail) {
		const key = `${f.file}|${f.table}`;
		if (!pairSet.has(key)) {
			pairSet.set(key, {
				file: f.file,
				table: f.table,
				owner: policy.owner[f.table] ?? "NONE",
			});
		}
	}
	const pairs = [...pairSet.values()].sort(
		(a, b) => a.file.localeCompare(b.file) || a.table.localeCompare(b.table),
	);

	const areaPairs = new Map<string, number>();
	const areaFiles = new Map<string, Set<string>>();
	const tablePairs = new Map<string, number>();
	for (const p of pairs) {
		const area = areaOf(p.file);
		areaPairs.set(area, (areaPairs.get(area) ?? 0) + 1);
		const seen = areaFiles.get(area) ?? new Set<string>();
		seen.add(p.file);
		areaFiles.set(area, seen);
		tablePairs.set(p.table, (tablePairs.get(p.table) ?? 0) + 1);
	}

	const byArea: CensusArea[] = [...areaPairs.entries()]
		.map(([area, count]) => ({ area, pairs: count, files: areaFiles.get(area)?.size ?? 0 }))
		.sort((a, b) => b.pairs - a.pairs || a.area.localeCompare(b.area));
	const byTable: CensusTable[] = [...tablePairs.entries()]
		.map(([table, count]) => ({ table, pairs: count, owner: policy.owner[table] ?? "NONE" }))
		.sort((a, b) => b.pairs - a.pairs || a.table.localeCompare(b.table));

	return {
		filesScanned: files.size,
		findings: detail.length,
		pairs,
		filesWithFindings: new Set(pairs.map((p) => p.file)).size,
		tables: byTable.length,
		byArea,
		byTable,
		detail,
	};
}

export function formatCensus(result: CensusResult): string {
	const lines: string[] = [];
	lines.push(
		`FILES SCANNED: ${result.filesScanned}   FINDINGS: ${result.findings}   ` +
			`FILE×TABLE PAIRS: ${result.pairs.length}   FILES WITH FINDINGS: ${result.filesWithFindings}   ` +
			`TABLES: ${result.tables}`,
	);
	let current = "";
	for (const f of [...result.detail].sort(
		(a, b) => a.file.localeCompare(b.file) || a.line - b.line,
	)) {
		if (f.file !== current) {
			current = f.file;
			lines.push("", current);
		}
		lines.push(`   :${f.line} ${f.table}`);
	}
	lines.push("", "==== BY AREA (file×table pairs / files) ====");
	for (const a of result.byArea) {
		lines.push(`${String(a.pairs).padStart(4)} pairs  ${String(a.files).padStart(3)} files  ${a.area}`);
	}
	lines.push("", "==== BY TABLE ====");
	for (const t of result.byTable) {
		lines.push(`${String(t.pairs).padStart(4)}  ${t.table}  -> ${t.owner}`);
	}
	return `${lines.join("\n")}\n`;
}

/** The census never fails a build — it reports, and exits 0 either way. */
function main(): void {
	process.stdout.write(formatCensus(runCensus(process.cwd())));
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
	main();
}
