/**
 * AR4b — Formation seam: the assistant's persona is decided at turn time from
 * the app-owned `users.systemPrompt` row, NOT a hardcoded constant.
 *
 * The persona is `agentConfig.systemPrompt` (`provisioner.ts`), baked at EMIT
 * time by `resolveAssistantTurnRequest` from the assistant agent's own
 * `users` row, the exact column `PATCH /api/users/:userId/assistant` writes.
 * Proven at the BAKE boundary — the `agent_work_intents` row's
 * `agentConfig.systemPrompt` — since there is no second execution entry to
 * mock.
 */

import { agentWorkIntents, type HyperIdleDb, threads, users } from "@hyperidle/db";
import type { BakedAgentRunnableConfig } from "@hyperidle/shared";
import { and, eq } from "drizzle-orm";
import type { Hono } from "hono";
import { beforeEach, describe, expect, vi } from "vitest";
import {
	createInProcessCoreApiTransport,
	registerCoreApiTransport,
} from "../services/core-api-port-composition.js";
import { test as baseTest } from "../test-fixtures.js";

const test = baseTest.extend<{ coreApiSeamRegistration: undefined }>({
	coreApiSeamRegistration: [
		async ({ app }, use) => {
			registerCoreApiTransport(createInProcessCoreApiTransport(app));
			await use(undefined);
		},
		{ auto: true },
	],
});

const FOUNDER_ID = "founder-ar4b-formation";
const ASSISTANT_ID = `ast-${FOUNDER_ID}`;
const THREAD_ID = "thread-ar4b-formation";
const GATE_API_KEY = "ar4b-formation-key";
const ALPHA_PERSONA = "AR4b-test-persona-alpha — you are the Alpha test assistant.";

async function seedFixtures(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(users).values({
		id: FOUNDER_ID,
		name: "AR4b Formation Founder",
		role: "founder",
		status: "active",
		kind: "human",
		createdAt: now,
	});
	await db.insert(users).values({
		id: ASSISTANT_ID,
		name: "Assistant",
		role: "assistant",
		kind: "ai",
		agentCategory: "individual",
		status: "active",
		harnessType: "builtin",
		modelId: "deepseek/deepseek-v4-flash",
		modelProvider: "openrouter",
		systemPrompt: "Original row persona — the app default.",
		maxConcurrentSessions: 1,
		createdAt: now,
	});
	await db.insert(threads).values({
		id: THREAD_ID,
		hostKind: "user",
		hostId: FOUNDER_ID,
		initiatorId: FOUNDER_ID,
		participants: JSON.stringify([FOUNDER_ID, ASSISTANT_ID]),
		pinned: false,
		createdAt: now,
		lastActiveAt: now,
	});
}

/** Posts a message on the assistant thread and returns the baked `agentConfig` for the resulting intent. */
async function postAndCaptureBakedAgentConfig(
	app: Hono,
	db: HyperIdleDb,
	clientKey: string,
): Promise<BakedAgentRunnableConfig> {
	const res = await app.request(`/api/threads/${THREAD_ID}/messages`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-API-Key": GATE_API_KEY,
			"X-Identity": FOUNDER_ID,
		},
		body: JSON.stringify({
			type: "plain",
			payload: { text: `AR4b formation seam test (${clientKey})` },
			clientKey,
		}),
	});
	expect([200, 201]).toContain(res.status);
	const body = (await res.json()) as { message: { id: string } };
	const messageId = body.message.id;

	const [intent] = await db
		.select()
		.from(agentWorkIntents)
		.where(
			and(eq(agentWorkIntents.kind, "assistant_turn"), eq(agentWorkIntents.sourceId, messageId)),
		);
	expect(intent).toBeDefined();
	const baked = JSON.parse(intent?.bakedRequestJson ?? "{}") as {
		agentConfig?: BakedAgentRunnableConfig;
	};
	expect(baked.agentConfig).toBeDefined();
	return baked.agentConfig as BakedAgentRunnableConfig;
}

describe("AR4b: formation seam — the assistant's persona is baked from users.systemPrompt at turn time", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", GATE_API_KEY);
	});

	test("default row persona is baked when no PATCH has ever run", async ({ db, app }) => {
		await seedFixtures(db);

		const agentConfig = await postAndCaptureBakedAgentConfig(app, db, "msg-ar4b-default");
		expect(agentConfig.systemPrompt).toBe("Original row persona — the app default.");
	});

	test("a PATCH /api/users/:userId/assistant persona edit is baked into the NEXT turn (AC3)", async ({
		db,
		app,
	}) => {
		await seedFixtures(db);

		const before = await postAndCaptureBakedAgentConfig(app, db, "msg-ar4b-before-patch");
		expect(before.systemPrompt).toBe("Original row persona — the app default.");

		const patchRes = await app.request(`/api/users/${FOUNDER_ID}/assistant`, {
			method: "PATCH",
			headers: {
				"Content-Type": "application/json",
				"X-API-Key": GATE_API_KEY,
				"X-Identity": FOUNDER_ID,
			},
			body: JSON.stringify({ systemPrompt: ALPHA_PERSONA }),
		});
		expect(patchRes.status).toBe(200);

		const after = await postAndCaptureBakedAgentConfig(app, db, "msg-ar4b-after-patch");
		expect(after.systemPrompt).toBe(ALPHA_PERSONA);

		// Changing the formation response changes the assistant's form.
		expect(before.systemPrompt).not.toBe(after.systemPrompt);
	});
});
