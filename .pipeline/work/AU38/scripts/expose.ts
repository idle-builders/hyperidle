/**
 * AU38 expose — turn a vitest JSON result file into mechanical work orders.
 *
 * Usage:
 *   npx vitest run --config vitest.integration.config.ts --project service \
 *     --reporter=json --outputFile=.pipeline/work/AU38/scripts/results.json || true
 *   npx tsx .pipeline/work/AU38/scripts/expose.ts
 *
 * Reads results.json, classifies every failure by error signature, and writes:
 *   - work-orders.json  (machine-readable)
 *   - work-orders.md    (builder-facing table: file -> class -> extracted values)
 *
 * Classes:
 *   COLLISION   duplicate key violation — Postgres names the table + the exact value
 *   ASSERTION   toBe/toHaveLength/toEqual mismatch — assertion needs scoping
 *   MODULE      module-registry / vi.mock leakage
 *   TIMEOUT     hook/test timeout — leaked timer or hang
 *   OTHER       anything unclassified (inspected by hand, then class added here)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const RESULTS = join(HERE, "results.json");

interface Assertion {
	fullName: string;
	status: string;
	failureMessages: string[];
}
interface FileResult {
	name: string;
	status: string;
	assertionResults: Assertion[];
}
interface VitestJson {
	numTotalTests: number;
	numPassedTests: number;
	numFailedTests: number;
	numPendingTests: number;
	testResults: FileResult[];
}

type Class = "COLLISION" | "ASSERTION" | "MODULE" | "TIMEOUT" | "OTHER";

interface WorkOrder {
	file: string;
	failedTests: number;
	classes: Class[];
	collisions: Array<{ table: string; column: string; value: string }>;
	sampleErrors: string[];
}

function classify(msg: string): Class {
	if (/duplicate key value violates unique constraint/.test(msg)) return "COLLISION";
	if (/Timed out|timeout \d+ms|hookTimeout|testTimeout/.test(msg)) return "TIMEOUT";
	if (/vi\.mock|mock(ed)? module|module registry|resetModules|Cannot find module/.test(msg))
		return "MODULE";
	if (
		/AssertionError|expected .* to (be|equal|have length|contain|match)|expect\(/.test(msg)
	)
		return "ASSERTION";
	return "OTHER";
}

function extractCollisions(msg: string): Array<{ table: string; column: string; value: string }> {
	const out: Array<{ table: string; column: string; value: string }> = [];
	const constraint = msg.match(/unique constraint "([^"]+)"/);
	const key = msg.match(/Key \(([^)]+)\)=\(([^)]*)\) already exists/);
	if (key) {
		out.push({
			table: constraint?.[1] ?? "?",
			column: key[1],
			value: key[2],
		});
	}
	return out;
}

function main(): void {
	const raw = readFileSync(RESULTS, "utf8");
	const json = JSON.parse(raw) as VitestJson;
	const orders = new Map<string, WorkOrder>();

	for (const file of json.testResults) {
		const failed = (file.assertionResults ?? []).filter((a) => a.status === "failed");
		if (failed.length === 0) continue;
		const rel = resolve(file.name).replace(resolve(HERE, "../../../..") + "/", "");
		const order: WorkOrder = {
			file: rel,
			failedTests: failed.length,
			classes: [],
			collisions: [],
			sampleErrors: [],
		};
		for (const assertion of failed) {
			const msg = (assertion.failureMessages ?? []).join("\n");
			const cls = classify(msg);
			if (!order.classes.includes(cls)) order.classes.push(cls);
			if (cls === "COLLISION") {
				for (const c of extractCollisions(msg)) {
					if (!order.collisions.some((x) => x.value === c.value && x.column === c.column))
						order.collisions.push(c);
				}
			}
			if (order.sampleErrors.length < 2) {
				const firstLine = msg.split("\n").find((l) => l.trim().length > 0) ?? "";
				order.sampleErrors.push(`${assertion.fullName}: ${firstLine.slice(0, 200)}`);
			}
		}
		orders.set(rel, order);
	}

	const list = [...orders.values()].sort((a, b) => a.file.localeCompare(b.file));
	writeFileSync(join(HERE, "work-orders.json"), JSON.stringify(list, null, 2));

	const byClass = new Map<Class, number>();
	let collisionFiles = 0;
	for (const o of list) {
		for (const c of o.classes) byClass.set(c, (byClass.get(c) ?? 0) + 1);
		if (o.collisions.length > 0) collisionFiles++;
	}

	const lines: string[] = [];
	lines.push("# AU38 work orders (measured, not estimated)");
	lines.push("");
	lines.push(
		`Lane: ${json.numTotalTests} tests — ${json.numPassedTests} passed, ${json.numFailedTests} failed, ${json.numPendingTests} pending.`,
	);
	lines.push(`Files failing: ${list.length}. By class: ${[...byClass.entries()].map(([k, v]) => `${k}=${v}`).join(", ")}.`);
	lines.push(`Files with extracted collision values (codemod-able): ${collisionFiles}.`);
	lines.push("");
	lines.push("| file | failed | classes | collision values (table.column) |");
	lines.push("|---|---|---|---|");
	for (const o of list) {
		const cols = o.collisions.map((c) => `\`${c.value}\` (${c.table}.${c.column})`).join("<br>") || "—";
		lines.push(`| ${o.file} | ${o.failedTests} | ${o.classes.join("+")} | ${cols} |`);
	}
	lines.push("");
	lines.push("## Sample errors (first 2 per file)");
	for (const o of list) {
		lines.push(`### ${o.file}`);
		for (const s of o.sampleErrors) lines.push(`- ${s}`);
	}
	writeFileSync(join(HERE, "work-orders.md"), lines.join("\n"));

	console.log(`files failing: ${list.length}`);
	console.log(`by class: ${[...byClass.entries()].map(([k, v]) => `${k}=${v}`).join(" ")}`);
	console.log(`codemod-able collision files: ${collisionFiles}`);
	console.log(`wrote work-orders.json + work-orders.md`);
}

main();
