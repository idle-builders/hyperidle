/**
 * AU21 §9 Increment 11 (Decision H2 follow-up) — closes a real Wave A
 * regression: Wave A deleted `dispatch`'s live `ports.users.getOrCreateUser`
 * + `ports.settings.readServerConfig` reads and, with them, silently dropped
 * the per-agent model override (`users.modelId`/`modelProvider`, configured
 * via Settings → Agents / `packages/web/src/settings/AgentEditor.tsx`)
 * instead of baking it forward — a real regression, not an acceptable
 * trade-off (the commit's own message admitted this).
 *
 * This proves `resolveAssistantTurnRequest` (the same emit-time resolver
 * Wave A already extended to bake `transcript`) ALSO bakes `modelId`/
 * `modelProvider` from the SAME `requireRunnableAgent` row it already reads
 * to validate runnability — no extra read, matching Decision H2's own
 * principle: "core bakes everything a run needs at emit."
 */

import { type HyperIdleDb, messages, threads, users } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { requireRunnableAgent } from "@hyperidle/users";

async function seedThread(
	db: HyperIdleDb,
	options: {
		readonly threadId: string;
		readonly senderId: string;
		readonly assistantId: string;
		readonly modelId?: string | null;
		readonly modelProvider?: string | null;
	},
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(users).values([
		{
			id: options.senderId,
			kind: "human",
			name: "Human",
			role: "founder",
			status: "active",
			createdAt: now,
		},
		{
			id: options.assistantId,
			kind: "ai",
			name: "Assistant",
			role: "assistant",
			status: "active",
			createdAt: now,
			modelId: options.modelId ?? null,
			modelProvider: options.modelProvider ?? null,
		},
	]);
	await db.insert(threads).values({
		id: options.threadId,
		hostKind: "user",
		hostId: options.senderId,
		initiatorId: options.senderId,
		participants: JSON.stringify([options.senderId, options.assistantId]),
		pinned: true,
		lastActiveAt: now,
		createdAt: now,
	});
}

async function seedMessage(
	db: HyperIdleDb,
	options: {
		readonly messageId: string;
		readonly threadId: string;
		readonly senderId: string;
		readonly text: string;
	},
): Promise<void> {
	await db.insert(messages).values({
		id: options.messageId,
		senderId: options.senderId,
		threadId: options.threadId,
		type: "plain",
		payload: JSON.stringify({ text: options.text }),
		clientKey: `client-${options.messageId}`,
		createdAt: new Date().toISOString(),
	});
}

describe("resolveAssistantTurnRequest — bakes the per-agent model override", () => {
	test("bakes the target agent's configured modelId/modelProvider onto the request", async ({
		db,
	}) => {
		const { resolveAssistantTurnRequest } = await import("../assistant-turn-resolver.js");
		const threadId = "thread-model-override-bake-1";
		const senderId = "user-model-override-bake-1";
		const assistantId = "ast-user-model-override-bake-1";
		await seedThread(db, {
			threadId,
			senderId,
			assistantId,
			modelId: "claude-opus-4-6",
			modelProvider: "anthropic",
		});
		await seedMessage(db, {
			messageId: "msg-model-override-bake-1",
			threadId,
			senderId,
			text: "trigger",
		});

		const baked = await resolveAssistantTurnRequest(db, "msg-model-override-bake-1", {
			requireRunnableAgent,
		});

		expect(baked.modelId).toBe("claude-opus-4-6");
		expect(baked.modelProvider).toBe("anthropic");
	});

	test("bakes null modelId/modelProvider when the agent has no override configured", async ({
		db,
	}) => {
		const { resolveAssistantTurnRequest } = await import("../assistant-turn-resolver.js");
		const threadId = "thread-model-override-bake-2";
		const senderId = "user-model-override-bake-2";
		const assistantId = "ast-user-model-override-bake-2";
		await seedThread(db, { threadId, senderId, assistantId });
		await seedMessage(db, {
			messageId: "msg-model-override-bake-2",
			threadId,
			senderId,
			text: "trigger",
		});

		const baked = await resolveAssistantTurnRequest(db, "msg-model-override-bake-2", {
			requireRunnableAgent,
		});

		expect(baked.modelId).toBeNull();
		expect(baked.modelProvider).toBeNull();
	});
});
