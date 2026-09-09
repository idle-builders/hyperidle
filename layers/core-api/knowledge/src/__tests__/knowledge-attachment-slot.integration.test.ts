/**
 * Service integration tests for the parent+role read/write surface.
 *
 * Proves:
 * - getParentedItem finds an item by parent and role, ignoring scope entirely.
 * - listItemIdsByParent returns every role under one parent and nothing else.
 * - getAgentIdentity / getAgentIdentityIds resolve through the parent, even
 *   when the item's scope disagrees with the retired scope+role predicate —
 *   the test that proves the reverse lookup is actually gone, not just unused.
 * - upsertAgentIdentity writes the parent alongside the scope it always wrote.
 */
import { type HyperIdleDb, knowledgeItems } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import type { KnowledgeParentKind, KnowledgeRole } from "@hyperidle/domain-model";
import { eq } from "drizzle-orm";
import {
	getAgentIdentity,
	getAgentIdentityIds,
	getParentedItem,
	listItemIdsByParent,
	upsertAgentIdentity,
} from "../knowledge-repository.js";

function generateId(): string {
	return `test-${Math.random().toString(36).slice(2, 10)}`;
}

async function insertKnowledgeItem(
	db: HyperIdleDb,
	opts: {
		id?: string;
		title: string;
		body: string;
		role: KnowledgeRole;
		scopeKind?: "factory" | "team" | "user";
		scopeId?: string | null;
		parentKind?: KnowledgeParentKind | null;
		parentId?: string | null;
		status?: "active" | "proposed" | "archived";
	},
): Promise<string> {
	const id = opts.id ?? generateId();
	const now = new Date().toISOString();
	await db.insert(knowledgeItems).values({
		id,
		scopeKind: opts.scopeKind ?? "factory",
		scopeId: opts.scopeId ?? null,
		title: opts.title,
		body: opts.body,
		format: "markdown",
		status: opts.status ?? "active",
		role: opts.role,
		parentKind: opts.parentKind ?? null,
		parentId: opts.parentId ?? null,
		version: 1,
		updatedBy: "test-user",
		createdAt: now,
		updatedAt: now,
	});
	return id;
}

describe("getParentedItem: the item in a parent's named slot", () => {
	test("finds an item by parent and role, ignoring scope entirely", async ({ db }) => {
		// Deliberately give it a scope that has nothing to do with the parent —
		// the read must not consult scope at all.
		const id = await insertKnowledgeItem(db, {
			title: "Routine One — prompt",
			body: "Do the thing.",
			role: "prompt",
			scopeKind: "team",
			scopeId: "team-unrelated",
			parentKind: "routine",
			parentId: "routine-1",
		});

		const found = await getParentedItem(db, {
			parentKind: "routine",
			parentId: "routine-1",
			role: "prompt",
		});

		expect(found?.id).toBe(id);
		expect(found?.body).toBe("Do the thing.");
	});

	test("returns null when no item occupies the slot", async ({ db }) => {
		const found = await getParentedItem(db, {
			parentKind: "routine",
			parentId: "routine-absent",
			role: "prompt",
		});
		expect(found).toBeNull();
	});

	test("an explicit status filter excludes a non-matching item", async ({ db }) => {
		await insertKnowledgeItem(db, {
			title: "Archived prompt",
			body: "Old.",
			role: "prompt",
			parentKind: "routine",
			parentId: "routine-archived-slot",
			status: "archived",
		});

		const found = await getParentedItem(db, {
			parentKind: "routine",
			parentId: "routine-archived-slot",
			role: "prompt",
			status: "active",
		});
		expect(found).toBeNull();

		const foundNoFilter = await getParentedItem(db, {
			parentKind: "routine",
			parentId: "routine-archived-slot",
			role: "prompt",
		});
		expect(foundNoFilter).not.toBeNull();
	});
});

describe("listItemIdsByParent: everything under one parent", () => {
	test("returns every role under a parent and nothing else", async ({ db }) => {
		const promptId = await insertKnowledgeItem(db, {
			title: "Prompt",
			body: "b",
			role: "prompt",
			parentKind: "routine",
			parentId: "routine-multi",
		});
		const otherId = await insertKnowledgeItem(db, {
			title: "Different routine's prompt",
			body: "b",
			role: "prompt",
			parentKind: "routine",
			parentId: "routine-other",
		});
		const unparentedId = await insertKnowledgeItem(db, {
			title: "Unparented skill",
			body: "b",
			role: "skill",
		});

		const ids = await listItemIdsByParent(db, { parentKind: "routine", parentId: "routine-multi" });

		expect(ids).toEqual([promptId]);
		expect(ids).not.toContain(otherId);
		expect(ids).not.toContain(unparentedId);
	});

	test("returns an empty array for a parent with no knowledge", async ({ db }) => {
		const ids = await listItemIdsByParent(db, { parentKind: "agent", parentId: "agent-none" });
		expect(ids).toEqual([]);
	});
});

describe("agent identity resolves through the parent, not scope", () => {
	test("getAgentIdentity finds an identity parented to the agent even at a scope the old predicate would reject", async ({
		db,
	}) => {
		// scopeKind='team' here — the retired `scopeKind='user' AND scopeId=agentId`
		// predicate would never match this row. If getAgentIdentity still finds
		// it, the read has genuinely moved onto the parent.
		await insertKnowledgeItem(db, {
			id: "ki_af_agent-parent-test",
			title: "Agent — identity",
			body: "I am the agent.",
			role: "agent_file",
			scopeKind: "team",
			scopeId: "team-unrelated",
			parentKind: "agent",
			parentId: "agent-parent-test",
		});

		const body = await getAgentIdentity(db, "agent-parent-test");
		expect(body).toBe("I am the agent.");
	});

	test("getAgentIdentity finds nothing for an agent whose identity has no parent, even if scope matches the old predicate", async ({
		db,
	}) => {
		// The mirror case: old-shape scope binding, no parent. The retired
		// predicate would have matched; the new one must not.
		await insertKnowledgeItem(db, {
			id: "ki_af_scope-only",
			title: "Scope-only — identity",
			body: "Old-shape binding.",
			role: "agent_file",
			scopeKind: "user",
			scopeId: "scope-only-agent",
			parentKind: null,
			parentId: null,
		});

		const body = await getAgentIdentity(db, "scope-only-agent");
		expect(body).toBeNull();
	});

	test("getAgentIdentityIds resolves the same way for a batch of agents", async ({ db }) => {
		await insertKnowledgeItem(db, {
			id: "ki_af_batch-1",
			title: "Batch One — identity",
			body: "one",
			role: "agent_file",
			scopeKind: "team",
			scopeId: "team-x",
			parentKind: "agent",
			parentId: "agent-batch-1",
		});
		await insertKnowledgeItem(db, {
			id: "ki_af_batch-2",
			title: "Batch Two — identity",
			body: "two",
			role: "agent_file",
			parentKind: null,
			parentId: null,
		});

		const ids = await getAgentIdentityIds(db, ["agent-batch-1", "agent-batch-no-identity"]);
		expect(ids.get("agent-batch-1")).toBe("ki_af_batch-1");
		expect(ids.has("agent-batch-no-identity")).toBe(false);
	});
});

describe("upsertAgentIdentity writes the parent", () => {
	test("a newly created identity carries parentKind='agent' and parentId=agentId", async ({
		db,
	}) => {
		const id = await upsertAgentIdentity(db, {
			agentId: "agent-upsert-1",
			agentName: "Upsert Agent",
			body: "My identity.",
			updatedBy: "test-user",
		});

		const [row] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, id));
		expect(row).toMatchObject({
			parentKind: "agent",
			parentId: "agent-upsert-1",
			scopeKind: "user",
			scopeId: "agent-upsert-1",
		});

		const found = await getAgentIdentity(db, "agent-upsert-1");
		expect(found).toBe("My identity.");
		expect(id).toBe("ki_af_agent-upsert-1");
	});
});
