#!/usr/bin/env tsx
/**
 * AU18 §6.5 AC-6b shape-guard: fails the build if a generic `factory_settings`-
 * shaped key/value bucket table is (re-)introduced anywhere in the schema.
 *
 * Closes the "new-shape" half of AC-6b that table-deletion alone cannot cover
 * (see plan §6.5 — deleting the old `factorySettings` export makes any
 * *old-symbol* reference a `check` failure, but a brand-new
 * `pgTable("x", { key, value })` compiles clean and would be invisible to a
 * per-table `TABLE_OWNER`-map guard like AU8's, since that map only knows
 * about *known* tables). This guard is a schema-shape scan, not a
 * per-file/per-table-name check — it targets the shape itself.
 *
 * **Detection heuristic (name-based, NOT a universal KV detector — read
 * this before extending):** a `pgTable(...)` definition is flagged only when
 * its column set is EXACTLY:
 *   - one primary-key column whose property name is `key`, `k`, or `name`
 *     (case-insensitive) — a free-text, generic-looking identifier column, AND
 *   - exactly one more column named `value` (case-insensitive), AND
 *   - zero or more additional columns that are all timestamp-ish
 *     (`updatedAt`/`createdAt`/`updated_at`/`created_at`), ignored.
 * Any OTHER domain column present means the table is NOT flagged — this is
 * what keeps `server_config` (`id`/`config`/`updatedAt`, a fixed-`"default"`-PK
 * typed singleton, not a free-`key` generic pair) and `server_credentials`
 * (`name`/`encryptedValue`/`validationState`/`lastValidatedAt`/`updatedAt` —
 * PK named `name`, but NOT paired with a bare `value` column, and carries
 * real domain columns beyond it) both un-flagged, matching the zero-exceptions
 * allowlist verified in plan §6.5. This guard catches the CANONICAL
 * `factory_settings` shape/name pattern specifically. It does NOT catch an
 * arbitrarily-renamed future bucket (`{ id, data }`, `{ slug, payload }`) —
 * that is a deliberate, documented boundary, not an oversight. Do not treat
 * this guard as a general-purpose generic-KV detector when reviewing code
 * that references it.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import ts from "typescript";

/** The file this guard scans. All `pgTable(...)` definitions live here today (verified). */
const SCHEMA_FILE = "packages/db/src/schema.ts";

/** Case-insensitive generic-key-ish primary-key column names. */
const GENERIC_PK_NAMES = new Set(["key", "k", "name"]);

/** Case-insensitive timestamp-ish column names ignored when present alongside key+value. */
const TIMESTAMP_COLUMN_NAMES = new Set(["updatedat", "createdat", "updated_at", "created_at"]);

interface Finding {
	readonly file: string;
	readonly tableVarName: string;
	readonly reason: string;
}

interface ColumnInfo {
	readonly propName: string;
	readonly isPrimaryKey: boolean;
}

/** Walk a property's initializer call chain to detect `.primaryKey()`. */
function hasPrimaryKeyCall(node: ts.Expression): boolean {
	let current: ts.Node = node;
	while (ts.isCallExpression(current)) {
		if (ts.isPropertyAccessExpression(current.expression) && current.expression.name.text === "primaryKey") {
			return true;
		}
		if (ts.isPropertyAccessExpression(current.expression)) {
			current = current.expression.expression;
			continue;
		}
		break;
	}
	return false;
}

/** Extract column info from a `pgTable(name, { ...columns })` object-literal shape argument. */
function extractColumns(shapeArg: ts.Expression): ColumnInfo[] | null {
	if (!ts.isObjectLiteralExpression(shapeArg)) return null;
	const columns: ColumnInfo[] = [];
	for (const prop of shapeArg.properties) {
		if (!ts.isPropertyAssignment(prop)) return null; // shorthand/spread — bail, not our target shape
		const name = ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? prop.name.text : null;
		if (name === null) return null;
		columns.push({ propName: name, isPrimaryKey: hasPrimaryKeyCall(prop.initializer) });
	}
	return columns;
}

function evaluateShape(columns: ColumnInfo[]): boolean {
	const pkColumns = columns.filter((c) => c.isPrimaryKey);
	if (pkColumns.length !== 1) return false;
	const pk = pkColumns[0];
	if (!pk || !GENERIC_PK_NAMES.has(pk.propName.toLowerCase())) return false;

	const rest = columns.filter((c) => c !== pk);
	const valueColumns = rest.filter((c) => c.propName.toLowerCase() === "value");
	if (valueColumns.length !== 1) return false;

	const remaining = rest.filter((c) => c.propName.toLowerCase() !== "value");
	return remaining.every((c) => TIMESTAMP_COLUMN_NAMES.has(c.propName.toLowerCase()));
}

/** Scan a single file's AST for `export const X = pgTable("name", { ...columns })` shapes. */
function findViolations(abs: string, rel: string): Finding[] {
	const text = readFileSync(abs, "utf8");
	const ast = ts.createSourceFile(abs, text, ts.ScriptTarget.Latest, true);
	const findings: Finding[] = [];

	const visit = (node: ts.Node): void => {
		if (
			ts.isVariableDeclaration(node) &&
			ts.isIdentifier(node.name) &&
			node.initializer &&
			ts.isCallExpression(node.initializer) &&
			ts.isIdentifier(node.initializer.expression) &&
			node.initializer.expression.text === "pgTable"
		) {
			const args = node.initializer.arguments;
			const shapeArg = args[1];
			if (shapeArg) {
				const columns = extractColumns(shapeArg);
				if (columns && evaluateShape(columns)) {
					findings.push({
						file: rel,
						tableVarName: node.name.text,
						reason: `pgTable "${node.name.text}" is shaped like a generic key/value bucket (factory_settings pattern) — AU18 AC-6b forbids reintroducing this shape`,
					});
				}
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(ast);
	return findings;
}

export function inspect(root: string): Finding[] {
	const abs = join(root, SCHEMA_FILE);
	if (!existsSync(abs)) return [];
	return findViolations(abs, SCHEMA_FILE);
}

function writeFixture(root: string, rel: string, source: string): void {
	const abs = join(root, rel);
	mkdirSync(dirname(abs), { recursive: true });
	writeFileSync(abs, source);
}

function fixtureCheck(): void {
	// (1) Negative: a synthetic generic-KV pgTable — MUST be flagged.
	const negRoot = mkdtempSync(join(tmpdir(), "au18-kv-guard-neg-"));
	try {
		writeFixture(
			negRoot,
			SCHEMA_FILE,
			[
				'import { pgTable, text } from "drizzle-orm/pg-core";',
				'export const rogueSettings = pgTable("rogue_settings", {',
				'  key: text("key").primaryKey(),',
				'  value: text("value").notNull(),',
				'  updatedAt: text("updated_at").notNull(),',
				"});",
			].join("\n"),
		);
		const findings = inspect(negRoot);
		if (findings.length !== 1) {
			throw new Error(
				`fixture guard expected exactly 1 finding for a generic-KV pgTable, got ${findings.length}`,
			);
		}
	} finally {
		rmSync(negRoot, { recursive: true, force: true });
	}

	// (2) Positive: the real (post-drop) schema.ts must be clean.
	const findings = inspect(process.cwd());
	if (findings.length > 0) {
		throw new Error(
			`fixture guard expected the real schema to be clean, found ${findings.length}: ${findings.map((f) => f.tableVarName).join(", ")}`,
		);
	}

	// (3) True negatives: typed singleton / typed credential tables must NOT be flagged.
	const posRoot = mkdtempSync(join(tmpdir(), "au18-kv-guard-pos-"));
	try {
		writeFixture(
			posRoot,
			SCHEMA_FILE,
			[
				'import { pgTable, text } from "drizzle-orm/pg-core";',
				'export const serverConfig = pgTable("server_config", {',
				'  id: text("id").primaryKey().default("default"),',
				'  config: text("config").notNull().default("{}"),',
				'  updatedAt: text("updated_at").notNull(),',
				"});",
				'export const serverCredentials = pgTable("server_credentials", {',
				'  name: text("name").primaryKey(),',
				'  encryptedValue: text("encrypted_value").notNull(),',
				'  validationState: text("validation_state").notNull().default("present_untested"),',
				'  lastValidatedAt: text("last_validated_at"),',
				'  updatedAt: text("updated_at").notNull(),',
				"});",
			].join("\n"),
		);
		const posFindings = inspect(posRoot);
		if (posFindings.length > 0) {
			throw new Error(
				`fixture guard false-positived on typed singleton/credential tables: ${posFindings.map((f) => f.tableVarName).join(", ")}`,
			);
		}
	} finally {
		rmSync(posRoot, { recursive: true, force: true });
	}

	process.stdout.write("au18-kv-shape-guard fixtures: PASS\n");
}

if (process.argv.includes("--fixtures")) {
	fixtureCheck();
} else {
	const findings = inspect(process.cwd());
	for (const finding of findings) process.stderr.write(`${finding.file}: ${finding.reason}\n`);
	if (findings.length > 0) {
		process.stderr.write(`au18-kv-shape-guard: ${findings.length} finding(s)\n`);
		process.exit(1);
	}
	process.stdout.write("au18-kv-shape-guard: PASS\n");
}
