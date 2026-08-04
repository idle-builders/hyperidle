/**
 * AR4b — Formation seam: the assistant's persona is decided at turn time from
 * the app-owned run-config row, NOT a hardcoded constant.
 *
 * The persona is the `system_prompt` column `PATCH /api/users/:userId/assistant`
 * writes, and `admitSession` (`provisioner.ts`) reads it LIVE at drain through
 * `ports.agentRunConfig.readAgentRunConfig`.
 *
 * @lore AU26 G1 (architecture §D-L) x AU27: AU27 proved this at the BAKE
 * boundary — the `agent_work_intents` row's `agentConfig.systemPrompt` — because
 * at the time the persona was a `users` column core baked at emit. AU26 moved
 * the column into `agent_run_config`, which agent-orchestration OWNS, so there
 * is nothing for core to bake and `admitSession` reads it live instead. The
 * observable therefore moved with the data: this file still drives the exact
 * same route-level flow (post a message -> an `assistant_turn` intent is
 * emitted; PATCH the persona; post again) and still proves AC3 ("changing the
 * response changes the assistant's form"), but it reads the persona back
 * through `readAgentRunConfig` — the SAME function
 * `run-orchestration-composition.ts` wires into `ports.agentRunConfig` for the
 * drain — instead of off the snapshot. That is strictly fresher than the bake:
 * an edit between emit and drain now applies to that turn. It also asserts the
 * bake NO LONGER carries `systemPrompt`, pinning AU26's "do not re-bake it".
 */

import { readAgentRunConfig } from "@hyperidle/agent-run-config";
import { agentRunConfig, agentWorkIntents, type HyperIdleDb, threads, users } from "@hyperidle/db";
import type { BakedAgentRunnableConfig } from "@hyperidle/shared";
import { and, eq } from "drizzle-orm";
import type { Hono } from "hono";
import { beforeEach, describe, expect, vi } from "vitest";
import {
	createInProcessCoreApiTransport,
	registerCoreApiTransport,
} from "../services/core-api-port-composition.js";
import { test as baseTest } from "../__testing__/test-fixtures.js";

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
		createdAt: now,
	});
	// AU26 G1: the run config (persona included) lives in `agent_run_config` now.
	await db.insert(agentRunConfig).values({
		agentUserId: ASSISTANT_ID,
		harnessType: "builtin",
		modelId: "deepseek/deepseek-v4-flash",
		modelProvider: "openrouter",
		systemPrompt: "Original row persona — the app default.",
		maxConcurrentSessions: 1,
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

/**
 * Posts a message on the assistant thread, proves the `assistant_turn` intent
 * was emitted for it, and returns the persona the drain will run that turn
 * with — read through the production `readAgentRunConfig`.
 */
async function postAndResolveTurnPersona(
	app: Hono,
	db: HyperIdleDb,
	clientKey: string,
): Promise<string | null> {
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
		agentConfig?: BakedAgentRunnableConfig & { systemPrompt?: unknown };
	};
	expect(baked.agentConfig).toBeDefined();
	// AU26 G1: the persona is NOT core state any more, so it must not ride the bake.
	expect(baked.agentConfig).not.toHaveProperty("systemPrompt");

	// The exact read `admitSession` performs at drain through `ports.agentRunConfig`.
	const runConfig = await readAgentRunConfig(db, ASSISTANT_ID);
	return runConfig.systemPrompt;
}

describe("AR4b: formation seam — the assistant's persona is read live from agent_run_config at turn time", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", GATE_API_KEY);
	});

	test("default row persona drives the turn when no PATCH has ever run", async ({ db, app }) => {
		await seedFixtures(db);

		const persona = await postAndResolveTurnPersona(app, db, "msg-ar4b-default");
		expect(persona).toBe("Original row persona — the app default.");
	});

	test("a PATCH /api/users/:userId/assistant persona edit drives the NEXT turn (AC3)", async ({
		db,
		app,
	}) => {
		await seedFixtures(db);

		const before = await postAndResolveTurnPersona(app, db, "msg-ar4b-before-patch");
		expect(before).toBe("Original row persona — the app default.");

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

		const after = await postAndResolveTurnPersona(app, db, "msg-ar4b-after-patch");
		expect(after).toBe(ALPHA_PERSONA);

		// Changing the formation response changes the assistant's form.
		expect(before).not.toBe(after);
	});
});
