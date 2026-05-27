import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Post-PGlite migration: verify that no synchronous SQLite terminal methods
 * (`.run()`, `.get()`, `.all()`) remain in production code. These methods
 * don't exist on the async PGlite/postgres-js Drizzle drivers.
 *
 * Test files are excluded — they use createTestDb() which is async PGlite.
 */

const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");
const scanDirs = [
	path.join(repoRoot, "packages", "server", "src"),
	path.join(repoRoot, "packages", "fabric", "src"),
];

const SYNC_CALL_RE = /\.(?:run|get|all)\(\s*\)/g;

interface AuditHit {
	file: string;
	line: number;
	text: string;
}

function walk(dir: string, out: string[]): string[] {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === "__tests__" || entry.name === "node_modules") continue;
			walk(full, out);
		} else if (entry.name.endsWith(".ts")) {
			out.push(full);
		}
	}
	return out;
}

function audit(): AuditHit[] {
	const hits: AuditHit[] = [];
	for (const dir of scanDirs) {
		for (const file of walk(dir, [])) {
			const rel = path.relative(repoRoot, file);
			const raw = fs.readFileSync(file, "utf-8");
			const lines = raw.split("\n");
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				if (!line) continue;
				// Skip comments — @lore references to old patterns are fine
				if (line.trimStart().startsWith("//") || line.trimStart().startsWith("*")) continue;
				SYNC_CALL_RE.lastIndex = 0;
				if (SYNC_CALL_RE.test(line)) {
					hits.push({ file: rel, line: i + 1, text: line.trim() });
				}
			}
		}
	}
	return hits;
}

describe("PGlite migration: no sync SQLite terminal calls in production code", () => {
	it("zero .run()/.get()/.all() calls in server + fabric production code", () => {
		const hits = audit();

		if (hits.length > 0) {
			const report = hits
				.slice(0, 30)
				.map((h) => `  ${h.file}:${h.line}  ${h.text}`)
				.join("\n");
			const more = hits.length > 30 ? `\n  … and ${hits.length - 30} more` : "";
			expect.fail(
				`Found ${hits.length} sync Drizzle terminal calls in production code:\n${report}${more}`,
			);
		}
	});
});
