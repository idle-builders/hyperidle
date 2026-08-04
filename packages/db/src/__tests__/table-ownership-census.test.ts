/**
 * AU26 D0 — the table-ownership census (AC14).
 *
 * `scripts/table-ownership-census.ts` reports the ACL-violation surface under the
 * WP's **target** scope: every package's `src/` in the workspace, the four formerly
 * unowned tables assigned their AU26 owners, and no exemption set. It is reporting
 * only — it never fails a build, so the number can be quoted per increment while the
 * guard's own enforced scope stays where it is until D2.
 *
 * Strategy (the shipped guard-test idiom, cf. AF17-demo-fixture-guard.test.ts):
 * build a minimal temp workspace, call `runCensus(tmpRoot)`, assert on the result.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
	AU26_TABLE_OWNER_ADDITIONS,
	formatCensus,
	runCensus,
} from "../../../../scripts/table-ownership-census.js";

let tmpRoot: string;

beforeEach(() => {
	tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "au26-census-"));
});

afterEach(() => {
	fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function writeFile(relPath: string, content: string): void {
	const full = path.join(tmpRoot, relPath);
	fs.mkdirSync(path.dirname(full), { recursive: true });
	fs.writeFileSync(full, content, "utf8");
}

/** A workspace with the two tables the tests below exercise. */
function writeSchema(): void {
	writeFile(
		"packages/db/src/schema.ts",
		'export const knowledgeItems = pgTable("knowledge_items", {});\n' +
			'export const sessions = pgTable("sessions", {});\n',
	);
}

function pkg(relDir: string, name: string): void {
	writeFile(`${relDir}/package.json`, `{ "name": "${name}" }`);
}

describe("table-ownership census — target scope", () => {
	test("counts a foreign access from a nested Service package", () => {
		writeSchema();
		pkg("packages/core-api/knowledge", "@hyperidle/knowledge");
		pkg("packages/agent-orchestration/context-assembly", "@hyperidle/context-assembly");
		writeFile(
			"packages/agent-orchestration/context-assembly/src/leak.ts",
			'import { knowledgeItems } from "@hyperidle/db"; export const q = (db: Handle) => db.select().from(knowledgeItems);',
		);

		const result = runCensus(tmpRoot);

		expect(result.pairs).toEqual([
			{
				file: "packages/agent-orchestration/context-assembly/src/leak.ts",
				table: "knowledgeItems",
				owner: "packages/core-api/knowledge",
			},
		]);
		expect(result.filesWithFindings).toBe(1);
		expect(result.tables).toBe(1);
	});

	test("counts an access inside a top-level package with zero dependents", () => {
		writeSchema();
		pkg("packages/agent-orchestration", "@hyperidle/agent-orchestration");
		writeFile("packages/agent-orchestration/src/index.ts", "export {};");
		writeFile(
			"packages/agent-orchestration/src/routes/sessions.ts",
			'import { knowledgeItems } from "@hyperidle/db"; export const q = (db: Handle) => db.select().from(knowledgeItems);',
		);

		const result = runCensus(tmpRoot);

		expect(result.pairs.map((p) => p.file)).toEqual([
			"packages/agent-orchestration/src/routes/sessions.ts",
		]);
	});

	test("counts an access inside packages/db/src (the reachability corollary's region)", () => {
		writeSchema();
		pkg("packages/db", "@hyperidle/db");
		writeFile(
			"packages/db/src/factory-bootstrap.ts",
			'import { knowledgeItems } from "./schema.js"; export const q = (db: Handle) => db.insert(knowledgeItems);',
		);

		const result = runCensus(tmpRoot);

		expect(result.pairs.map((p) => p.file)).toContain("packages/db/src/factory-bootstrap.ts");
	});

	test("does not count the owning Service's own access", () => {
		writeSchema();
		pkg("packages/core-api/knowledge", "@hyperidle/knowledge");
		writeFile(
			"packages/core-api/knowledge/src/knowledge-reader.ts",
			'import { knowledgeItems } from "@hyperidle/db"; export const q = (db: Handle) => db.select().from(knowledgeItems);',
		);

		const result = runCensus(tmpRoot);

		expect(result.pairs).toEqual([]);
		expect(result.findings).toBe(0);
	});

	test("does not count test files or __tests__ directories", () => {
		writeSchema();
		pkg("packages/core-api/knowledge", "@hyperidle/knowledge");
		pkg("packages/agent-orchestration/context-assembly", "@hyperidle/context-assembly");
		writeFile(
			"packages/agent-orchestration/context-assembly/src/leak.test.ts",
			'import { knowledgeItems } from "@hyperidle/db"; export const q = (db: Handle) => db.select().from(knowledgeItems);',
		);
		writeFile(
			"packages/agent-orchestration/context-assembly/src/__tests__/seed.ts",
			'import { knowledgeItems } from "@hyperidle/db"; export const q = (db: Handle) => db.insert(knowledgeItems);',
		);

		const result = runCensus(tmpRoot);

		expect(result.pairs).toEqual([]);
	});
});

describe("table-ownership census — the four formerly-unowned tables are governed", () => {
	test("a foreign `sessions` access is a finding, owned by run-orchestration", () => {
		writeSchema();
		pkg("packages/core-api/policy", "@hyperidle/policy");
		writeFile(
			"packages/core-api/policy/src/handoff-protocol.ts",
			'import { sessions } from "@hyperidle/db"; export const q = (tx: Handle) => tx.update(sessions);',
		);

		const result = runCensus(tmpRoot);

		expect(result.pairs).toEqual([
			{
				file: "packages/core-api/policy/src/handoff-protocol.ts",
				table: "sessions",
				owner: "packages/agent-orchestration/run-orchestration",
			},
		]);
	});

	test("run-orchestration's own `sessions` access is legal", () => {
		writeSchema();
		pkg("packages/agent-orchestration/run-orchestration", "@hyperidle/run-orchestration");
		writeFile(
			"packages/agent-orchestration/run-orchestration/src/transition-run.ts",
			'import { sessions } from "@hyperidle/db"; export const q = (tx: Handle) => tx.update(sessions);',
		);

		expect(runCensus(tmpRoot).pairs).toEqual([]);
	});

	test("the added owner rows are exactly the tables the guard exempts today", () => {
		expect(AU26_TABLE_OWNER_ADDITIONS).toEqual({
			sessions: "packages/agent-orchestration/run-orchestration",
			propagationLog: "packages/core-api/policy",
			taskDispatchAttempts: "packages/core-api/work",
			userSkills: "packages/core-api/users",
		});
	});
});

describe("table-ownership census — reporting shape", () => {
	test("a file×table pair is counted once however many accesses it makes", () => {
		writeSchema();
		pkg("packages/core-api/knowledge", "@hyperidle/knowledge");
		pkg("packages/agent-orchestration/context-assembly", "@hyperidle/context-assembly");
		writeFile(
			"packages/agent-orchestration/context-assembly/src/leak.ts",
			'import { knowledgeItems } from "@hyperidle/db";\n' +
				"export const a = (db: Handle) => db.select().from(knowledgeItems);\n" +
				"export const b = (db: Handle) => db.insert(knowledgeItems);\n",
		);

		const result = runCensus(tmpRoot);

		expect(result.pairs).toHaveLength(1);
		expect(result.findings).toBe(3);
	});

	test("aggregates per area and per table", () => {
		writeSchema();
		pkg("packages/core-api/knowledge", "@hyperidle/knowledge");
		pkg("packages/eval", "@hyperidle/eval");
		writeFile(
			"packages/eval/src/judges.ts",
			'import { knowledgeItems, sessions } from "@hyperidle/db"; export const q = (db: Handle) => db.select().from(knowledgeItems).leftJoin(sessions);',
		);

		const result = runCensus(tmpRoot);

		expect(result.byArea).toEqual([{ area: "packages/eval/src", pairs: 2, files: 1 }]);
		expect(result.byTable).toEqual([
			{
				table: "knowledgeItems",
				pairs: 1,
				owner: "packages/core-api/knowledge",
			},
			{
				table: "sessions",
				pairs: 1,
				owner: "packages/agent-orchestration/run-orchestration",
			},
		]);
	});

	test("reports rather than throws on a tree full of violations, and prints the headline", () => {
		writeSchema();
		pkg("packages/core-api/knowledge", "@hyperidle/knowledge");
		pkg("packages/agent-orchestration/context-assembly", "@hyperidle/context-assembly");
		writeFile(
			"packages/agent-orchestration/context-assembly/src/leak.ts",
			'import { knowledgeItems } from "@hyperidle/db"; export const q = (db: Handle) => db.select().from(knowledgeItems);',
		);

		const result = runCensus(tmpRoot);
		const report = formatCensus(result);

		expect(report).toContain("FILE×TABLE PAIRS: 1");
		expect(report).toContain("FILES WITH FINDINGS: 1");
		expect(report).toContain("TABLES: 1");
		expect(report).toContain("packages/agent-orchestration/context-assembly/src/leak.ts");
	});
});
