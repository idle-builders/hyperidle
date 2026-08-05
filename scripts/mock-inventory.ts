#!/usr/bin/env tsx
/**
 * Mock-data inventory generator (M1).
 * Walks layers/core-ui/src/ and packages/server/src/, detects mock-data
 * offenders, emits inventory.json + inventory.md + queue.md.
 *
 * Usage:
 *   npm run mock-inventory          # write files
 *   npm run mock-inventory:check   # CI mode: compare, exit 1 on diff
 *
 * Architecture ref: M1 architecture.md § Phase D, File 6
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import {
	DEFAULT_PREFIX_DATA_PATHS,
	DEFAULT_SUFFIX_TRIGGERS,
	FORBIDDEN_IMPORT_FRAGMENTS,
	FORBIDDEN_PREFIXES,
	LITERAL_ID_STRINGS,
	PERMITTED_SURFACE_PATH_FRAGMENTS,
	PERMITTED_SURFACE_SUFFIXES,
	POLICY_DOC_URL,
	SEED_FILE_BASENAME_PREFIX,
} from "../tools/eslint-plugin-design/src/mock-data-policy.js";

import type {
	InventoryCheckResult,
	InventoryRow,
	RunInventoryCheckOptions,
	RunInventoryOptions,
} from "./lib/mock-inventory-types.js";

// Re-export types so callers can import them from here too.
export type { InventoryRow, InventoryCheckResult, RunInventoryOptions, RunInventoryCheckOptions };

// ---------------------------------------------------------------------------
// Permitted-surface filter
// ---------------------------------------------------------------------------

/**
 * Returns true when the file is on the permitted-mock surface (tests, stories,
 * fixtures, e2e, seed files). Files on the permitted surface are skipped.
 */
export function isPermittedSurface(filePath: string): boolean {
	if (PERMITTED_SURFACE_PATH_FRAGMENTS.some((f) => filePath.includes(f))) return true;
	if (PERMITTED_SURFACE_SUFFIXES.some((s) => filePath.endsWith(s))) return true;
	const base = basename(filePath);
	if (base.startsWith(SEED_FILE_BASENAME_PREFIX)) return true;
	return false;
}

// ---------------------------------------------------------------------------
// Triage hint heuristic (architecture.md § Decision 4)
// ---------------------------------------------------------------------------

/**
 * Heuristic triage hint for an inventory row.
 *
 * straight-swap: auth context (u-founder / founder@hyperidle.com) or
 *   FOUNDER_ID — the replacement is the auth context, which already exists.
 * needs-contract: SETTINGS, RAIL, COST, or agent-unassigned — no existing
 *   endpoint/service yet; M2 must design.
 * borderline: FALLBACK or AVATAR — visual fallback; M2 decides.
 * Default → borderline.
 */
export function computeTriageHint({
	symbol,
	kind,
}: {
	symbol: string;
	kind: "import" | "symbol" | "literal-id";
}): "straight-swap" | "needs-contract" | "borderline" {
	const upper = symbol.toUpperCase();

	// straight-swap: literal-id auth context
	if (kind === "literal-id") {
		if (symbol === "u-founder" || symbol === "founder@hyperidle.com") return "straight-swap";
		if (symbol === "agent-unassigned") return "needs-contract";
	}

	// straight-swap: FOUNDER_ID symbol (auth context)
	if (upper.includes("FOUNDER_ID")) return "straight-swap";

	// needs-contract: SETTINGS, RAIL, COST (no existing endpoint)
	if (upper.includes("SETTINGS") || upper.includes("RAIL") || upper.includes("COST")) {
		return "needs-contract";
	}

	// borderline: FALLBACK or AVATAR (visual fallback)
	if (upper.includes("FALLBACK") || upper.includes("AVATAR")) return "borderline";

	// Default
	return "borderline";
}

// ---------------------------------------------------------------------------
// Literal-id detection (architecture.md § Decision 3)
// ---------------------------------------------------------------------------

/**
 * Scan a file's content for quoted literal-id strings.
 * Returns hits with the matched string and kind.
 */
export function detectLiteralIds(
	content: string,
): Array<{ string: string; kind: "literal-id"; line: number }> {
	const hits: Array<{ string: string; kind: "literal-id"; line: number }> = [];
	const lines = content.split("\n");

	for (const literalId of LITERAL_ID_STRINGS) {
		// Match the literal id in single or double quotes.
		// Use a line-by-line approach to capture line numbers.
		const escaped = literalId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const re = new RegExp(`(?:"|')${escaped}(?:"|')`, "g");

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i] ?? "";
			if (re.test(line)) {
				hits.push({ string: literalId, kind: "literal-id", line: i + 1 });
			}
			re.lastIndex = 0; // reset after test()
		}
	}

	return hits;
}

// ---------------------------------------------------------------------------
// Symbol detection
// ---------------------------------------------------------------------------

/**
 * Returns true if the init value string represents a numeric literal.
 * Handles: plain numbers, underscore-separated (5_000), floats.
 * Strips trailing semicolons and whitespace before testing.
 */
function isNumericLiteralString(initStr: string): boolean {
	// Strip trailing semicolons, whitespace, and comments
	const trimmed = initStr.replace(/\s*;.*$/, "").trim();
	// Strip underscore separators (JS numeric separator syntax)
	const cleaned = trimmed.replace(/_/g, "");
	return /^-?\d+(\.\d+)?$/.test(cleaned);
}

/**
 * Scan a file's content for top-level const/let/export const declarations
 * with forbidden prefixes. Also catches DEFAULT_* with data-path or suffix
 * triggers (but NOT when the value is a numeric literal).
 *
 * @lore M1: This is a regex-based heuristic, not AST parsing. It catches the
 * common cases: `const FOO = ...` and `export const FOO = ...`. It may miss
 * destructured or complex declarations, but those are rare for the mock-data
 * pattern. The lint rule (AST-based) is the authoritative checker; the script
 * is for inventory generation.
 */
export function detectSymbols(
	content: string,
	filePath: string,
): Array<{ symbol: string; kind: "symbol"; line: number; shape: string; initStr: string }> {
	if (isPermittedSurface(filePath)) return [];

	const hits: Array<{
		symbol: string;
		kind: "symbol";
		line: number;
		shape: string;
		initStr: string;
	}> = [];

	const lines = content.split("\n");

	// Regex: matches `const NAME = ` or `export const NAME = ` at line start
	// Captures: symbol name and the init expression (rest of line)
	const DECL_RE =
		/^(?:export\s+)?(?:const|let)\s+([A-Z_][A-Z0-9_]*)\s*(?::\s*[^=]+)?\s*=\s*(.*)$/;

	for (let i = 0; i < lines.length; i++) {
		const line = (lines[i] ?? "").trim();
		const m = DECL_RE.exec(line);
		if (!m) continue;

		const symbolName = m[1] ?? "";
		const initStr = (m[2] ?? "").trim();

		// Determine shape from init
		let shape = "unknown";
		if (initStr.startsWith("[")) shape = "array";
		else if (initStr.startsWith("{")) shape = "object";
		else if (initStr.startsWith('"') || initStr.startsWith("'")) shape = "string";
		else if (/^\d/.test(initStr) || /^-\d/.test(initStr)) shape = "number";
		else shape = "expression";

		// Check forbidden prefixes (unconditional, not DEFAULT_)
		const prefix = FORBIDDEN_PREFIXES.find((p) => symbolName.startsWith(p));
		if (prefix) {
			hits.push({ symbol: symbolName, kind: "symbol", line: i + 1, shape, initStr });
			continue;
		}

		// Check DEFAULT_*
		if (symbolName.startsWith("DEFAULT_")) {
			// Numeric literal init → config constant, not mock data.
			if (isNumericLiteralString(initStr)) continue;

			// Path-based check
			const inDataPath = DEFAULT_PREFIX_DATA_PATHS.some((f) => filePath.includes(f));
			// Suffix-based check
			const upper = symbolName.toUpperCase();
			const hasSuffixTrigger = DEFAULT_SUFFIX_TRIGGERS.some((s) => upper.endsWith(s));

			if (inDataPath || hasSuffixTrigger) {
				hits.push({ symbol: symbolName, kind: "symbol", line: i + 1, shape, initStr });
			}
		}
	}

	return hits;
}

// ---------------------------------------------------------------------------
// Import detection
// ---------------------------------------------------------------------------

function detectImports(
	content: string,
	_filePath: string,
): Array<{ importPath: string; kind: "import"; line: number }> {
	const hits: Array<{ importPath: string; kind: "import"; line: number }> = [];
	const lines = content.split("\n");

	// Match: import ... from "path" or import ... from 'path'
	const IMPORT_RE = /^(?:import\s+(?:[^'"]+from\s+)?|(?:export\s+(?:\*|{[^}]*})\s+from\s+))["']([^"']+)["']/;

	for (let i = 0; i < lines.length; i++) {
		const line = (lines[i] ?? "").trim();
		const m = IMPORT_RE.exec(line);
		if (!m) continue;
		const importPath = m[1] ?? "";
		if (FORBIDDEN_IMPORT_FRAGMENTS.some((f) => importPath.includes(f))) {
			hits.push({ importPath, kind: "import", line: i + 1 });
		}
	}

	return hits;
}

// ---------------------------------------------------------------------------
// Importer count (grep-based heuristic)
// ---------------------------------------------------------------------------

function countImporters(
	symbolName: string,
	allFiles: Array<{ path: string; content: string }>,
	excludePath: string,
): number {
	let count = 0;
	for (const f of allFiles) {
		if (f.path === excludePath) continue;
		if (f.content.includes(symbolName)) count++;
	}
	return count;
}

// ---------------------------------------------------------------------------
// File walker
// ---------------------------------------------------------------------------

function walkTs(dir: string): string[] {
	const results: string[] = [];
	try {
		const entries = readdirSync(dir);
		for (const entry of entries) {
			const fullPath = join(dir, entry);
			try {
				const stat = statSync(fullPath);
				if (stat.isDirectory()) {
					results.push(...walkTs(fullPath));
				} else {
					const ext = extname(entry);
					if (ext === ".ts" || ext === ".tsx" || ext === ".js" || ext === ".jsx") {
						results.push(fullPath);
					}
				}
			} catch {
				// skip unreadable entries
			}
		}
	} catch {
		// skip missing or unreadable dirs
	}
	return results;
}

// ---------------------------------------------------------------------------
// Core inventory runner
// ---------------------------------------------------------------------------

/**
 * Run the inventory over the specified source directories.
 * Returns the sorted list of InventoryRow objects.
 */
export async function runInventory(options: RunInventoryOptions): Promise<InventoryRow[]> {
	const { webSrc, serverSrcDirs } = options;

	// Collect all files to scan
	const allFilePaths: string[] = [];
	if (webSrc) allFilePaths.push(...walkTs(webSrc));
	for (const dir of serverSrcDirs) allFilePaths.push(...walkTs(dir));

	// Read all file contents (needed for importer count)
	const allFiles = allFilePaths.map((p) => {
		let content = "";
		try {
			content = readFileSync(p, "utf8");
		} catch {
			// skip
		}
		return { path: p, content };
	});

	const rows: InventoryRow[] = [];

	for (const { path: filePath, content } of allFiles) {
		// Skip permitted surface
		if (isPermittedSurface(filePath)) continue;

		// Detect symbols
		const symbolHits = detectSymbols(content, filePath);
		for (const hit of symbolHits) {
			const triageHint = computeTriageHint({ symbol: hit.symbol, kind: "symbol" });
			const importerCount = countImporters(hit.symbol, allFiles, filePath);
			rows.push({
				path: filePath,
				line: hit.line,
				symbol: hit.symbol,
				kind: "symbol",
				shape: hit.shape,
				importerCount,
				triageHint,
			});
		}

		// Detect imports
		const importHits = detectImports(content, filePath);
		for (const hit of importHits) {
			const triageHint = computeTriageHint({ symbol: hit.importPath, kind: "import" });
			rows.push({
				path: filePath,
				line: hit.line,
				symbol: hit.importPath,
				kind: "import",
				shape: "import",
				importerCount: 0,
				triageHint,
			});
		}

		// Detect literal ids
		const literalHits = detectLiteralIds(content);
		for (const hit of literalHits) {
			const triageHint = computeTriageHint({ symbol: hit.string, kind: "literal-id" });
			rows.push({
				path: filePath,
				line: hit.line,
				symbol: hit.string,
				kind: "literal-id",
				shape: "string",
				importerCount: 0,
				triageHint,
			});
		}
	}

	// Sort by path then line for stable diffs
	rows.sort((a, b) => {
		const pa = a.path.localeCompare(b.path);
		if (pa !== 0) return pa;
		return a.line - b.line;
	});

	return rows;
}

// ---------------------------------------------------------------------------
// --check mode
// ---------------------------------------------------------------------------

/**
 * CI drift check. Regenerates the inventory in memory, compares against
 * the checked-in inventory.json. Returns result with ok/exitCode/added/removed.
 */
export async function runInventoryCheck(
	options: RunInventoryCheckOptions,
): Promise<InventoryCheckResult> {
	const { inventoryPath, repoRoot, ...runOptions } = options;
	const currentAbs = await runInventory(runOptions);
	// Relativize against repoRoot when supplied so the comparison is portable
	// across machines (local macOS path prefixes differ from CI Linux).
	const current = repoRoot
		? currentAbs.map((r) => ({ ...r, path: relative(repoRoot, r.path) }))
		: currentAbs;

	// Read checked-in inventory
	let checkedIn: InventoryRow[] = [];
	try {
		const raw = readFileSync(inventoryPath, "utf8");
		checkedIn = JSON.parse(raw) as InventoryRow[];
	} catch {
		// Missing or invalid file → treat as empty
		checkedIn = [];
	}

	// Compare by serializing to JSON (same sort order)
	const currentJson = JSON.stringify(current, null, 2);
	const checkedInJson = JSON.stringify(checkedIn, null, 2);

	if (currentJson === checkedInJson) {
		return { ok: true, exitCode: 0 };
	}

	// Compute diff
	const currentPaths = new Set(current.map((r) => `${r.path}:${r.line}:${r.symbol}`));
	const checkedInPaths = new Set(checkedIn.map((r) => `${r.path}:${r.line}:${r.symbol}`));

	const added = current.filter((r) => !checkedInPaths.has(`${r.path}:${r.line}:${r.symbol}`));
	const removed = checkedIn.filter((r) => !currentPaths.has(`${r.path}:${r.line}:${r.symbol}`));

	return { ok: false, exitCode: 1, added, removed };
}

// ---------------------------------------------------------------------------
// Markdown emitters
// ---------------------------------------------------------------------------

function emitMarkdown(rows: InventoryRow[], repoRoot: string): string {
	const lines: string[] = [
		"# Mock-data inventory",
		"",
		`_Generated by \`scripts/mock-inventory.ts\` on ${new Date().toISOString().slice(0, 10)}._`,
		"",
		`Total offenders: **${rows.length}**`,
		"",
	];

	// Group by triage hint
	const buckets: Record<string, InventoryRow[]> = {
		"straight-swap": [],
		"needs-contract": [],
		borderline: [],
	};
	for (const row of rows) {
		(buckets[row.triageHint] ?? (buckets["borderline"] = [])).push(row);
	}

	for (const [hint, hintRows] of Object.entries(buckets)) {
		if (hintRows.length === 0) continue;
		lines.push(`## ${hint} (${hintRows.length})`);
		lines.push("");
		lines.push("| path | line | symbol | kind | shape |");
		lines.push("|---|---|---|---|---|");
		for (const row of hintRows) {
			const relPath = relative(repoRoot, row.path);
			lines.push(`| \`${relPath}\` | ${row.line} | \`${row.symbol}\` | ${row.kind} | ${row.shape} |`);
		}
		lines.push("");
	}

	return lines.join("\n");
}

function emitQueue(rows: InventoryRow[], repoRoot: string): string {
	const lines: string[] = [
		"# Mock-data purge queue",
		"",
		`_Generated by \`scripts/mock-inventory.ts\` on ${new Date().toISOString().slice(0, 10)}._`,
		"",
		"Check off rows as they are closed in M3.",
		"",
	];

	for (const row of rows) {
		const relPath = relative(repoRoot, row.path);
		lines.push(`- [ ] \`${relPath}:${row.symbol}\` (${row.triageHint})`);
	}

	return lines.join("\n");
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

/**
 * AU19 Increment 5 item 6: `packages/server/src` no longer exists —
 * Increment 2/5 dissolved it into the `core-api`/`agent-orchestration`/
 * `agent-execution` Layer packages (each with its own composition-root
 * `src/` PLUS many nested `packages/<layer>/<service>/src/` Service
 * packages) and the `remote-server`/`remote-worker` Application bootstraps.
 * Mirrors `table-ownership-guard.ts`'s `nestedServiceRoots()` discovery
 * pattern rather than hand-listing ~31 Service dirs (same rationale: a
 * hardcoded list silently goes blind when a Service package is
 * added/renamed — this is the exact class of bug this fix is closing).
 */
function collectAU19SrcDirs(repoRoot: string): string[] {
	const dirs: string[] = [];
	const layers = ["core-api", "agent-orchestration", "agent-execution"];
	const applications = ["remote-server", "remote-worker"];

	for (const layer of layers) {
		const layerDir = join(repoRoot, "layers", layer);
		if (!existsSync(layerDir)) continue;
		// Layer's own composition-root src/ (e.g. core-api/src).
		const layerSrc = join(layerDir, "src");
		if (existsSync(layerSrc)) dirs.push(layerSrc);
		// Nested Service package src/ dirs (layers/<layer>/<service>/src).
		for (const entry of readdirSync(layerDir, { withFileTypes: true })) {
			if (!entry.isDirectory() || entry.name === "node_modules" || entry.name === "dist") {
				continue;
			}
			const svcSrc = join(layerDir, entry.name, "src");
			if (existsSync(svcSrc)) dirs.push(svcSrc);
		}
	}

	for (const app of applications) {
		const appSrc = join(repoRoot, "applications", app, "src");
		if (existsSync(appSrc)) dirs.push(appSrc);
	}

	return dirs;
}

// Node-compatible entrypoint check (replaces Bun's import.meta.main)
const isEntrypoint =
	process.argv[1] ===
	(typeof __filename === "string" ? __filename : fileURLToPath(import.meta.url));
if (isEntrypoint) {
	const isCheck = process.argv.includes("--check");

	// Determine repo root from script location
	const scriptPath = fileURLToPath(import.meta.url);
	// scripts/mock-inventory.ts → repo root is one level up
	const repoRoot = join(scriptPath, "..", "..");
	const webSrc = join(repoRoot, "layers/core-ui/src");
	const serverSrcDirs = collectAU19SrcDirs(repoRoot);
	const outDir = join(repoRoot, "plans/mock-data-purge");
	const inventoryPath = join(outDir, "inventory.json");

	const webSrcExists = existsSync(webSrc);

	if (isCheck) {
		const result = await runInventoryCheck({
			webSrc: webSrcExists ? webSrc : null,
			serverSrcDirs,
			inventoryPath,
			repoRoot,
		});

		if (!result.ok) {
			process.stderr.write("mock-inventory --check: inventory.json is stale.\n");
			if (result.added && result.added.length > 0) {
				process.stderr.write(`  Added rows (${result.added.length}):\n`);
				for (const row of result.added) {
					process.stderr.write(
						`    + ${row.path}:${row.line} ${row.symbol} (${row.kind})\n`,
					);
				}
			}
			if (result.removed && result.removed.length > 0) {
				process.stderr.write(`  Removed rows (${result.removed.length}):\n`);
				for (const row of result.removed) {
					process.stderr.write(
						`    - ${row.path}:${row.line} ${row.symbol} (${row.kind})\n`,
					);
				}
			}
			process.stderr.write(
				"  Run `npm run mock-inventory` to regenerate, then commit the updated inventory.json.\n",
			);
			process.exit(1);
		}

		process.stdout.write("mock-inventory --check: inventory.json is up to date.\n");
		process.exit(0);
	}

	// Write mode — persist with repo-relative paths so the file is portable
	// across machines (local macOS vs CI Linux). Markdown emitters take the
	// absolute rows + repoRoot and relativize themselves.
	const rowsAbs = await runInventory({
		webSrc: webSrcExists ? webSrc : null,
		serverSrcDirs,
	});
	const rows = rowsAbs.map((r) => ({ ...r, path: relative(repoRoot, r.path) }));

	mkdirSync(outDir, { recursive: true });

	writeFileSync(inventoryPath, JSON.stringify(rows, null, 2));
	writeFileSync(join(outDir, "inventory.md"), emitMarkdown(rowsAbs, repoRoot));
	writeFileSync(join(outDir, "queue.md"), emitQueue(rowsAbs, repoRoot));

	const byKind = {
		symbol: rows.filter((r) => r.kind === "symbol").length,
		import: rows.filter((r) => r.kind === "import").length,
		"literal-id": rows.filter((r) => r.kind === "literal-id").length,
	};

	process.stdout.write(
		`mock-inventory: ${rows.length} rows written to plans/mock-data-purge/\n` +
			`  symbol: ${byKind.symbol}, import: ${byKind.import}, literal-id: ${byKind["literal-id"]}\n` +
			`  See: ${POLICY_DOC_URL}\n`,
	);
}
