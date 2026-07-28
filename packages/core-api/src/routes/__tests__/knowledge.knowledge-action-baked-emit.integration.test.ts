/**
 * AU21 Increment 3, knowledge_action wave (RED) — architecture.md §6 Decision B /
 * §9 Increment 3: the REAL emit call site (`routes/knowledge.ts`'s `POST
 * /:id/flag` handler, the `enqueueWorkIntent(...)` call inside its
 * `if (body.agentId)` branch) must resolve + validate the knowledge-review
 * run AT EMIT TIME and bake the full request onto the `agent_work_intents`
 * row, instead of enqueuing a bare identity-only intent for the drain to
 * resolve later.
 *
 * Currently RED on two counts, both proven below:
 *   1. The emitted intent's `bakedRequestJson` is null today (the route does
 *      not yet call the new knowledge resolver before recording).
 *   2. Because nothing is baked, the drain still falls through to
 *      `resolveIntentInputInternal`'s "knowledge_action" case at DRAIN time,
 *      which reads `knowledge.findById`/`users.getUserById` — a domain read
 *      this migration must delete. Proven by wiring THOSE deps to throw and
 *      asserting the real emitted intent still hands off (it must not,
 *      today).
 */

import { agentWorkIntents, type HyperIdleDb, knowledgeItems, users } from "@hyperidle/db";
import { drainIntents } from "@hyperidle/session-requests";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { queueDeps } from "../../services/durable-agent-queue.js";
import { test } from "../../test-fixtures.js";

const TEST_API_KEY = "test-key-au21-knowledge-action-emit";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

async function seedRunnableAgent(db: HyperIdleDb, id: string): Promise<void> {
	await db.insert(users).values({
		id,
		kind: "ai",
		name: "Agent",
		role: "builder",
		status: "active",
		createdAt: new Date().toISOString(),
	});
}

async function seedKnowledgeItem(
	db: HyperIdleDb,
	options: { readonly id: string; readonly updatedBy: string },
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(knowledgeItems).values({
		id: options.id,
		scopeKind: "factory",
		scopeId: null,
		title: "Flag me",
		body: "Body content",
		format: "markdown",
		status: "draft",
		version: 1,
		updatedBy: options.updatedBy,
		createdAt: now,
		updatedAt: now,
	});
}

describe("knowledge_action is resolved and baked at emit time (POST /api/knowledge/:id/flag)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("flagging with agentId bakes the knowledge_action request onto the recorded intent", async ({
		db,
		app,
	}) => {
		await seedRunnableAgent(db, "ast-au21-knowledge-emit-1");
		await seedKnowledgeItem(db, {
			id: "item-au21-knowledge-emit-1",
			updatedBy: "ast-au21-knowledge-emit-1",
		});

		const res = await app.request("/api/knowledge/item-au21-knowledge-emit-1/flag", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ reason: "Needs review", agentId: "ast-au21-knowledge-emit-1" }),
		});
		expect(res.status).toBe(200);

		const [intent] = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.sourceId, "knowledge:item-au21-knowledge-emit-1"));
		expect(intent).toBeDefined();
		expect(intent?.kind).toBe("knowledge_action");

		// RED today: `bakedRequestJson` is null — the route does not yet bake
		// the request at emit time.
		expect(intent?.bakedRequestJson).toBeTruthy();
		const baked = intent?.bakedRequestJson
			? (JSON.parse(intent.bakedRequestJson) as Record<string, unknown>)
			: undefined;
		expect(baked).toMatchObject({
			defaultAgentId: "ast-au21-knowledge-emit-1",
			sourceKind: "knowledge",
			sourceId: "knowledge:item-au21-knowledge-emit-1",
			streamId: "knowledge:item-au21-knowledge-emit-1",
			sourceCorrelation: {
				knowledgeItemId: "item-au21-knowledge-emit-1",
				action: "review",
			},
		});
	});

	test("the drain hands off the real emitted knowledge_action intent from its baked payload — ZERO knowledge/users domain reads", async ({
		db,
		app,
		eventBus,
	}) => {
		await seedRunnableAgent(db, "ast-au21-knowledge-emit-2");
		await seedKnowledgeItem(db, {
			id: "item-au21-knowledge-emit-2",
			updatedBy: "ast-au21-knowledge-emit-2",
		});

		const res = await app.request("/api/knowledge/item-au21-knowledge-emit-2/flag", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ reason: "Needs review", agentId: "ast-au21-knowledge-emit-2" }),
		});
		expect(res.status).toBe(200);

		const base = queueDeps(db);
		const throwingFindById = vi.fn(async () => {
			throw new Error("zero-domain-read violation: knowledge.findById was called");
		});
		const throwingGetUserById = vi.fn(async () => {
			throw new Error("zero-domain-read violation: users.getUserById was called");
		});
		const deps = {
			...base,
			eventBus,
			knowledge: { ...base.knowledge, findById: throwingFindById },
			users: { ...base.users, getUserById: throwingGetUserById },
		};

		await drainIntents(deps);

		// RED today: the route never baked a request, so the drain falls
		// through to the per-kind "knowledge_action" resolution, which calls
		// these domain reads — both throwing spies get invoked, and the
		// intent ends up `failed`, not `handed_off`.
		expect(throwingFindById.mock.calls.length).toBe(0);
		expect(throwingGetUserById.mock.calls.length).toBe(0);

		const [intent] = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.sourceId, "knowledge:item-au21-knowledge-emit-2"));
		expect(intent?.status).toBe("handed_off");
		expect(intent?.requestId).toBeTruthy();
	});
});
