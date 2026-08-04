/**
 * AU21 Increment 3, knowledge_action wave — architecture.md §6 Decision B /
 * §9 Increment 3: the REAL emit call site (`routes/knowledge.ts`'s `POST
 * /:id/flag` handler, the `enqueueWorkIntent(...)` call inside its
 * `if (body.agentId)` branch) must resolve + validate the knowledge-review
 * run AT EMIT TIME and bake the full request onto the `agent_work_intents`
 * row, instead of enqueuing a bare identity-only intent for the drain to
 * resolve later.
 *
 * GREEN (was RED when first written): both counts below now hold.
 *   1. The emitted intent's `bakedRequestJson` is populated at emit time.
 *   2. `resolveIntentInputInternal`'s old "knowledge_action" per-kind
 *      drain-time resolution (which used to read `knowledge.findById`/
 *      `users.getUserById`) is DELETED, not merely unreachable — AU21 §9
 *      Increment 9 removed the dead `knowledge`/`users.getUserById` fields
 *      from `DurableAgentQueueDeps` entirely (confirmed zero real call sites
 *      left anywhere in `@hyperidle/session-requests`), so the type system
 *      itself now proves zero domain reads — a stronger guarantee than the
 *      throwing-spy wiring this test originally used.
 */

import * as os from "node:os";
import * as path from "node:path";
import {
	agentWorkIntents,
	type HyperIdleDb,
	knowledgeItems,
	messages,
	threads,
	users,
} from "@hyperidle/db";
import { drainIntents } from "@hyperidle/session-requests";
import { EventBus, type ToolContext } from "@hyperidle/shared";
import { buildToolDefinitions } from "@hyperidle/tool-handlers";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import {
	createInProcessCoreApiTransport,
	registerCoreApiTransport,
} from "../../services/core-api-port-composition.js";
import { queueDeps } from "../../services/durable-agent-queue.js";
import { toolHandlersPorts } from "../../services/tool-handlers-bindings.js";
import { test as baseTest } from "../../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-au21-knowledge-action-emit";

const test = baseTest.extend<{ coreApiSeamRegistration: undefined }>({
	coreApiSeamRegistration: [
		async ({ app }, use) => {
			registerCoreApiTransport(createInProcessCoreApiTransport(app));
			await use(undefined);
		},
		{ auto: true },
	],
});

const replyTool = buildToolDefinitions(toolHandlersPorts).find((t) => t.name === "reply")!;

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

		// `DurableAgentQueueDeps` no longer HAS a `knowledge`/`users.getUserById`
		// field at all (AU21 §9 Increment 9 deleted the dead composition) — the
		// drain can only ever hand off from the baked payload; there is no
		// domain-read fallback left to wire a throwing spy onto.
		const deps = { ...queueDeps(db), eventBus };

		await drainIntents(deps);

		const [intent] = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.sourceId, "knowledge:item-au21-knowledge-emit-2"));
		expect(intent?.status).toBe("handed_off");
		expect(intent?.requestId).toBeTruthy();
	});

	// @lore AU26 E3: the K1 test that lived here proved this emit site baked
	// the owning human's held connections onto the intent. That bake is
	// deleted — connections are read live at spawn — so there is nothing
	// left for this site to forget. See
	// `connections-added-after-emit.integration.test.ts`.

	// AU27 — a knowledge_action session resolves its own calling thread at
	// emit, so its `reply` tool call lands a real message in the knowledge
	// item's own thread, not a fallback direct thread.
	test("flagging with agentId bakes callingThreadId, and the resolved session's reply lands in the item's own thread", async ({
		db,
		app,
	}) => {
		await seedRunnableAgent(db, "ast-au27-knowledge-emit-thread");
		await seedKnowledgeItem(db, {
			id: "item-au27-knowledge-emit-thread",
			updatedBy: "ast-au27-knowledge-emit-thread",
		});

		const res = await app.request("/api/knowledge/item-au27-knowledge-emit-thread/flag", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ reason: "Needs review", agentId: "ast-au27-knowledge-emit-thread" }),
		});
		expect(res.status).toBe(200);

		const [intent] = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.sourceId, "knowledge:item-au27-knowledge-emit-thread"));
		const baked = intent?.bakedRequestJson
			? (JSON.parse(intent.bakedRequestJson) as { callingThreadId?: string })
			: undefined;
		expect(baked?.callingThreadId).toBeTruthy();
		const callingThreadId = baked?.callingThreadId as string;

		const [thread] = await db.select().from(threads).where(eq(threads.id, callingThreadId));
		expect(thread?.hostKind).toBe("knowledge_item");
		expect(thread?.hostId).toBe("item-au27-knowledge-emit-thread");

		const ctx: ToolContext<HyperIdleDb> = {
			db,
			eventBus: new EventBus(),
			agentId: "ast-au27-knowledge-emit-thread",
			sessionId: "session-au27-knowledge-emit-thread",
			taskId: "",
			threadId: callingThreadId,
			sandboxPath: path.join(os.tmpdir(), `hi-au27-knowledge-reply-${Date.now()}`),
			ingestion: { dispose: (): void => {} },
		};
		const replyResult = await replyTool.handler({ text: "Reviewed and updated." }, ctx);
		expect(replyResult.success).toBe(true);
		if (!replyResult.success) return;
		const data = replyResult.data as { messageId: string; threadId: string };
		expect(data.threadId).toBe(callingThreadId);

		const [inserted] = await db.select().from(messages).where(eq(messages.id, data.messageId));
		expect(inserted?.threadId).toBe(callingThreadId);
		expect(inserted?.senderId).toBe("ast-au27-knowledge-emit-thread");
	});
});
