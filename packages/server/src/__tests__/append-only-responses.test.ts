/**
 * L4 — `responses` is logically append-only (static-codebase invariant).
 *
 * Mirrors the L1 invariant on `agent_skill_autonomy_audit`. After L4 lands,
 * every state change to a verdict (commit OR undo) is a NEW row — the table
 * MUST never be UPDATE-ed or DELETE-ed by application code.
 *
 * The greener path:
 *   - The L2 transaction inside `routes/conversations.ts` only INSERTs.
 *   - L4's undo endpoint INSERTs an undo row; never UPDATEs the original.
 *
 * This test scans the server source tree for any `db.update(responses)` or
 * `tx.update(responses)` (and the equivalent `delete` calls) and fails on
 * any hit outside the migration files.
 *
 * MUST fail today only if the scaffolding is wrong; once the L4 endpoint is
 * implemented as INSERT-only, this stays green forever.
 */
import { describe, expect, it } from "vitest";

describe("L4: responses table is append-only (static invariant)", () => {
	it("no server source file UPDATEs or DELETEs responses", async () => {
		const fs = await import("node:fs/promises");
		const path = await import("node:path");

		const serverSrc = path.resolve(__dirname, "..");
		// Match `db.update(responses)` / `tx.update(responses)` (and delete).
		// Whitespace-tolerant; identifier boundaried to avoid false hits on
		// variables that happen to contain the substring (e.g. `responsesById`).
		const pattern = /\b(?:update|delete)\s*\(\s*responses\s*\)/;
		const skipFile = "append-only-responses.test.ts";

		async function listTsFiles(dir: string): Promise<string[]> {
			const entries = await fs.readdir(dir, { withFileTypes: true });
			const out: string[] = [];
			for (const entry of entries) {
				if (entry.name === "node_modules" || entry.name === "dist") continue;
				const full = path.join(dir, entry.name);
				if (entry.isDirectory()) {
					out.push(...(await listTsFiles(full)));
				} else if (entry.isFile() && entry.name.endsWith(".ts")) {
					out.push(full);
				}
			}
			return out;
		}

		const allFiles = await listTsFiles(serverSrc);
		const offenders: string[] = [];
		for (const full of allFiles) {
			if (full.endsWith(skipFile)) continue;
			const content = await fs.readFile(full, "utf8");
			if (pattern.test(content)) {
				offenders.push(path.relative(serverSrc, full));
			}
		}

		expect(offenders).toEqual([]);
	});
});
