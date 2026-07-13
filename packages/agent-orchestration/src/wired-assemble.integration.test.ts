import { knowledgeItems } from "@hyperidle/db";
import { expect, test } from "@hyperidle/db/test-fixtures";
import { wiredAssemble } from "./index.js";

/**
 * Proves the ONE real cross-Service edge Increment 0 wires end-to-end:
 * agent-orchestration Layer → context-assembly.assemble → knowledge.list → real DB.
 * The other four ports are transitional stubs, so their bundle fields are empty.
 */
test("wiredAssemble reads knowledge through the real Layer-wired edge", async ({ db }) => {
	await db.insert(knowledgeItems).values({
		id: "ki-wired-1",
		scopeKind: "team",
		scopeId: "t9",
		title: "Wired edge item",
		body: "body",
		format: "md",
		status: "active",
		updatedBy: "u1",
		createdAt: "2026-07-13T00:00:00Z",
		updatedAt: "2026-07-13T00:00:00Z",
	});

	const bundle = await wiredAssemble(db, { scopeKind: "team", scopeId: "t9" }, "u1");

	// Real knowledge edge populated:
	expect(bundle.knowledge).toHaveLength(1);
	expect(bundle.knowledge[0]?.id).toBe("ki-wired-1");
	// Transitional-stub ports return empty (never on a production path in Inc 0):
	expect(bundle.openBets).toEqual([]);
	expect(bundle.authorDisplayName).toBeNull();
	expect(bundle.activeRoutines).toEqual([]);
	expect(bundle.mountedPaths).toEqual([]);
});
