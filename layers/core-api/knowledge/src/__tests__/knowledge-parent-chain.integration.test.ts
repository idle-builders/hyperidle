/**
 * @lore nested-knowledge-items architecture.md §5 / review.md B4 — the ancestor
 * chain a bake needs is resolved once, at bake time, by
 * `resolveParentChain`, and `assembleSessionKnowledge` attaches it to every
 * ordinary item it ranks. Before this fix, `BakedContextKnowledgeItem.parentChain`
 * had exactly one production writer (`toBakedContextKnowledgeItems`) and it
 * defaulted to `[]` — every ordinary item materialised flat into `knowledge/`
 * regardless of its real tree position.
 */
import { documents, type HyperIdleDb } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { resolveParentChain } from "../knowledge-repository.js";
import { assembleSessionKnowledge } from "../session-knowledge-assembler.js";

async function insertKnowledgeItem(
	db: HyperIdleDb,
	opts: {
		id: string;
		title: string;
		scopeKind?: "factory" | "team" | "user";
		scopeId?: string | null;
		parentId?: string | null;
	},
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(documents).values({
		id: opts.id,
		title: opts.title,
		body: "body",
		format: "markdown",
		status: "active",
		slot: "ordinary",
		version: 1,
		updatedBy: "test-user",
		scopeKind: opts.scopeKind ?? "factory",
		scopeId: opts.scopeId ?? null,
		parentKind: opts.parentId ? "document" : null,
		parentId: opts.parentId ?? null,
		createdAt: now,
		updatedAt: now,
	});
}

describe("resolveParentChain", () => {
	test("returns the ancestor chain root-first, each carrying id/title/scopeKind/version", async ({
		db,
	}) => {
		await insertKnowledgeItem(db, { id: "ki-root", title: "Product" });
		await insertKnowledgeItem(db, { id: "ki-mid", title: "Pricing", parentId: "ki-root" });
		await insertKnowledgeItem(db, {
			id: "ki-leaf",
			title: "Objections",
			parentId: "ki-mid",
		});

		const chain = await resolveParentChain(db, "ki-leaf");
		expect(chain.map((a) => a.id)).toEqual(["ki-root", "ki-mid"]);
		expect(chain[0]).toMatchObject({ title: "Product", scopeKind: "factory", version: 1 });
		expect(chain[1]).toMatchObject({ title: "Pricing", scopeKind: "factory", version: 1 });
	});

	test("is empty for a root item", async ({ db }) => {
		await insertKnowledgeItem(db, { id: "ki-solo", title: "Solo" });
		const chain = await resolveParentChain(db, "ki-solo");
		expect(chain).toEqual([]);
	});

	test("stops at a non-document parent — a task-parented item has no ancestors", async ({ db }) => {
		const now = new Date().toISOString();
		await db.insert(documents).values({
			id: "ki-task-child",
			title: "Task note",
			body: "body",
			format: "markdown",
			status: "active",
			slot: "ordinary",
			version: 1,
			updatedBy: "test-user",
			scopeKind: "factory",
			scopeId: null,
			parentKind: "task",
			parentId: "some-task-id",
			createdAt: now,
			updatedAt: now,
		});

		const chain = await resolveParentChain(db, "ki-task-child");
		expect(chain).toEqual([]);
	});
});

describe("assembleSessionKnowledge: parentChain (review.md B4)", () => {
	test("an ordinary item's baked parentChain matches its real ancestors — not the [] default", async ({
		db,
	}) => {
		await insertKnowledgeItem(db, { id: "ki-root-2", title: "Practices" });
		await insertKnowledgeItem(db, {
			id: "ki-child-2",
			title: "Objection handling",
			parentId: "ki-root-2",
		});

		const items = await assembleSessionKnowledge(db, {
			agentId: "agent-parent-chain",
			agentRole: "builder",
			taskDescription: "",
		});

		const child = items.find((i) => i.id === "ki-child-2");
		expect(child).toBeDefined();
		expect(child?.parentChain.map((a) => a.id)).toEqual(["ki-root-2"]);
		expect(child?.parentChain[0]?.title).toBe("Practices");
	});
});
