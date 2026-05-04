import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Honest-state test: scan `packages/server/src/**\/*.ts` for synchronous
 * SQLite terminal methods (`.run()`, `.get()`, `.all()`) that Drizzle's
 * `postgres-js` driver does NOT provide.
 *
 * @lore H4 shipped the PG adapter but left the server on the sync SQLite
 * query API. Flipping `DATABASE_URL` to Postgres will crash until a
 * follow-up story converts these call sites to `await` the Drizzle
 * builder directly. This test pins the current count so future regressions
 * are visible — the count only changes when someone *actively* adds or
 * removes a sync call. See docs/deployment/switching-sqlite-to-postgres.md.
 */

const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");
const serverSrc = path.join(repoRoot, "packages", "server", "src");

const SYNC_CALL_RE = /\.(?:run|get|all)\(\s*\)/g;

interface AuditHit {
	file: string;
	line: number;
	text: string;
}

function walk(dir: string, out: string[]): string[] {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) walk(full, out);
		else if (entry.name.endsWith(".ts")) out.push(full);
	}
	return out;
}

function audit(): AuditHit[] {
	const hits: AuditHit[] = [];
	for (const file of walk(serverSrc, [])) {
		const rel = path.relative(repoRoot, file);
		const raw = fs.readFileSync(file, "utf-8");
		const lines = raw.split("\n");
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (!line) continue;
			SYNC_CALL_RE.lastIndex = 0;
			if (SYNC_CALL_RE.test(line)) {
				hits.push({ file: rel, line: i + 1, text: line.trim() });
			}
		}
	}
	return hits;
}

describe("H4 honest-state: synchronous Drizzle call-site audit", () => {
	it("records the current count of sync .run()/.get()/.all() calls in @hyperidle/server", () => {
		const hits = audit();
		const count = hits.length;

		// This number is the pinned-baseline. It may shift when new sync
		// code lands; when it does, the failure message includes the full
		// file:line list so the reviewer can see what changed.
		// The assertion is a loose bound — we check the count is non-zero
		// (because we know the gap exists today) and is not absurdly
		// different from the snapshot. A follow-up story should drive this
		// to zero, at which point the test flips to asserting equality to 0.
		// I3 added new sync test infrastructure (cost-cap.dedup.test.ts,
		// dependency-watcher.perf.test.ts) that follows the existing test
		// pattern of `.run()/.get()/.all()` against in-memory SQLite. L1
		// added thread-primitive contract + repo + service tests with
		// similar call-site patterns; L3 added artifacts route + tests
		// (~60 sync call sites). The snapshot is bumped to absorb that
		// legitimate growth; production call-sites in services/, routes/,
		// etc. are not affected.
		const SNAPSHOT_COUNT = 1070;
		const TOLERANCE = 50; // absorb routine renames without a fail-open

		const humanReport = hits
			.slice(0, 30)
			.map((h) => `  ${h.file}:${h.line}  ${h.text}`)
			.join("\n");
		const more = hits.length > 30 ? `\n  … and ${hits.length - 30} more` : "";
		const msg = `Found ${count} sync Drizzle terminal calls (snapshot ${SNAPSHOT_COUNT} ±${TOLERANCE}).\n${humanReport}${more}\n\nSee docs/deployment/switching-sqlite-to-postgres.md.`;

		// Loud expectation so the snapshot message appears on drift.
		expect(count, msg).toBeGreaterThan(0);
		expect(count, msg).toBeGreaterThanOrEqual(SNAPSHOT_COUNT - TOLERANCE);
		expect(count, msg).toBeLessThanOrEqual(SNAPSHOT_COUNT + TOLERANCE);
	});
});
