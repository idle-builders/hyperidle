/**
 * L2 review (W10) — Static-source invariant: `thread_routing_audit`
 * is logically append-only. The audit trail's value depends on rows
 * surviving unmodified. This regression test forbids any call to
 * `db.update(threadRoutingAudit)` / `db.delete(threadRoutingAudit)` in
 * server source. Mirrors the L1 `agent_skill_autonomy_audit` test in
 * `autonomy-service.test.ts`.
 *
 * Adding a new writer that needs to mutate or remove an audit row
 * must be a deliberate decision: remove the guard here AND document
 * the change in `schema.ts` lore.
 */
import { describe, expect, it } from "vitest";

describe("L2: thread_routing_audit is append-only (static invariant)", () => {
	it("no server source file UPDATEs or DELETEs threadRoutingAudit", async () => {
		const fs = await import("node:fs/promises");
		const path = await import("node:path");

		const serverSrc = path.resolve(__dirname, "..", "..");
		// Match `db.update(threadRoutingAudit` / `tx.update(threadRoutingAudit`
		// and the equivalent `delete` calls. Whitespace tolerant.
		const pattern = /\b(?:update|delete)\s*\(\s*threadRoutingAudit\b/;
		const skipFile = "thread-routing-service.test.ts";

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
