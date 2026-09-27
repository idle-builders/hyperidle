/**
 * architecture.md §6.7 — `assembleSessionDocuments` is no longer a pure read:
 * its last step is one batched `bumpSessionUse` over exactly the documents it
 * is about to return. Proven here against the real assembler, not against
 * `bumpSessionUse` directly (that's `document-store.integration.test.ts`'s
 * job) — this pins the END-TO-END wiring: a document the assembler actually
 * picks gets counted, one it does not pick stays untouched, and the count
 * joins (and rolls back with) the caller's own transaction, exactly as
 * `edit_task`'s (`task-actions.ts:759-763`, `tx as HyperIdleDb`) does.
 */
import { documents, type HyperIdleDb } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { eq } from "drizzle-orm";
import { assembleSessionDocuments } from "../session-documents.js";

const NOW = "2026-08-01T00:00:00.000Z";
const AGENT_ID = "agent-usage-probe";
const TASK_DESCRIPTION = "Prove the usage bump end to end.";

async function seedCorpus(db: HyperIdleDb): Promise<void> {
	// factory-scoped — in scope for every session, the assembler will return it.
	await db.insert(documents).values({
		id: "doc-usage-picked",
		scopeKind: "factory",
		scopeId: null,
		title: "Factory-wide practice",
		body: "Applies to every session.",
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: AGENT_ID,
		createdAt: NOW,
		updatedAt: NOW,
	});
	// user-scoped to a DIFFERENT agent — out of reach, the assembler will not
	// return it, so its counters must stay untouched.
	await db.insert(documents).values({
		id: "doc-usage-unpicked",
		scopeKind: "user",
		scopeId: "agent-usage-someone-else",
		title: "Someone else's note",
		body: "Not reachable by the probe agent.",
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: "agent-usage-someone-else",
		createdAt: NOW,
		updatedAt: NOW,
	});
}

describe("assembleSessionDocuments — session_use_count (architecture.md §6.7)", () => {
	test("bumps sessionUseCount and lastUsedAt for every returned id, leaves an unpicked document at 0/NULL, and leaves version/updatedAt untouched", async ({
		db,
	}) => {
		await seedCorpus(db);

		const budgeted = await assembleSessionDocuments(db, {
			taskDescription: TASK_DESCRIPTION,
			agentId: AGENT_ID,
		});
		const returnedIds = budgeted.map((item) => item.id);
		expect(returnedIds).toContain("doc-usage-picked");
		expect(returnedIds).not.toContain("doc-usage-unpicked");

		const [picked] = await db.select().from(documents).where(eq(documents.id, "doc-usage-picked"));
		expect(picked?.sessionUseCount).toBe(1);
		expect(picked?.lastUsedAt).not.toBeNull();
		expect(picked?.version).toBe(1);
		expect(picked?.updatedAt).toBe(NOW);

		const [unpicked] = await db
			.select()
			.from(documents)
			.where(eq(documents.id, "doc-usage-unpicked"));
		expect(unpicked?.sessionUseCount).toBe(0);
		expect(unpicked?.lastUsedAt).toBeNull();
	});

	test("bumps every returned id exactly once per call, accumulating across calls", async ({
		db,
	}) => {
		await seedCorpus(db);

		await assembleSessionDocuments(db, {
			taskDescription: TASK_DESCRIPTION,
			agentId: AGENT_ID,
		});
		await assembleSessionDocuments(db, {
			taskDescription: TASK_DESCRIPTION,
			agentId: AGENT_ID,
		});

		const [picked] = await db.select().from(documents).where(eq(documents.id, "doc-usage-picked"));
		expect(picked?.sessionUseCount).toBe(2);
	});

	test("a call inside a transaction that rolls back leaves no count behind", async ({ db }) => {
		await seedCorpus(db);

		await expect(
			db.transaction(async (tx) => {
				await assembleSessionDocuments(tx as HyperIdleDb, {
					taskDescription: TASK_DESCRIPTION,
					agentId: AGENT_ID,
				});
				throw new Error("rollback");
			}),
		).rejects.toThrow("rollback");

		const [picked] = await db.select().from(documents).where(eq(documents.id, "doc-usage-picked"));
		expect(picked?.sessionUseCount).toBe(0);
		expect(picked?.lastUsedAt).toBeNull();
	});
});

/**
 * @lore `resolveParentChain` resolves the ancestor chain once at bake time; `assembleSessionDocuments` attaches it to every ordinary item it ranks.
 */
describe("assembleSessionDocuments: parentChain (review.md B4)", () => {
	test("an ordinary item's baked parentChain matches its real ancestors — not the [] default", async ({
		db,
	}) => {
		const now = new Date().toISOString();
		await db.insert(documents).values({
			id: "doc-parentchain-root",
			title: "Practices",
			body: "body",
			format: "markdown",
			status: "active",
			slot: "ordinary",
			version: 1,
			updatedBy: "test-user",
			scopeKind: "factory",
			scopeId: null,
			parentKind: null,
			parentId: null,
			createdAt: now,
			updatedAt: now,
		});
		await db.insert(documents).values({
			id: "doc-parentchain-child",
			title: "Objection handling",
			body: "body",
			format: "markdown",
			status: "active",
			slot: "ordinary",
			version: 1,
			updatedBy: "test-user",
			scopeKind: "factory",
			scopeId: null,
			parentKind: "document",
			parentId: "doc-parentchain-root",
			createdAt: now,
			updatedAt: now,
		});

		const items = await assembleSessionDocuments(db, {
			agentId: "agent-parent-chain",
			taskDescription: "",
		});

		const child = items.find((i) => i.id === "doc-parentchain-child");
		expect(child).toBeDefined();
		expect(child?.parentChain.map((a) => a.id)).toEqual(["doc-parentchain-root"]);
		expect(child?.parentChain[0]?.title).toBe("Practices");
	});
});
