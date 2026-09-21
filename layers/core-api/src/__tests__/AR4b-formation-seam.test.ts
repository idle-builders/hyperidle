/**
 * AR4b — Formation seam: the assistant's identity is decided from editable
 * state at turn time, NOT a hardcoded constant.
 *
 * @lore AU26 G1 (architecture §D-L) x AU27 x BA9f: the observable has moved
 * twice, because the persona has. AU27 proved it at the bake boundary (a
 * `users` column core baked at emit); AU26 moved it to `agent_run_config`,
 * which orchestration owns, so it was read live at drain instead. BA9f made it
 * an `agent_file` knowledge document bound to the agent — which is what an
 * agent file has always meant — so it is core-owned state again and rides the
 * bake, exactly like the context bundle beside it (AU21 §H3: the provisioner
 * consumes a baked bundle and reads zero core-api state).
 *
 * What the test proves has NOT moved: AC3 — changing the identity changes what
 * the assistant's next turn runs with. It still drives the same flow (send a
 * message through `send_message` -> a `thread_turn` intent is emitted for the
 * woken agent; edit the identity; send again) and reads the persona back off
 * the bake the drain will actually use. It also pins that the run config no
 * longer carries a persona: one home for the identity, not two.
 *
 * @lore this file drove the deleted `POST /api/threads/:id/messages` route and
 * the `assistant_turn` intent kind keyed by bare `messageId`. The thread
 * module (architecture.md §3.10/§7) replaced both: the door is
 * `POST /api/actions/send_message`, the intent kind is `thread_turn`, and its
 * `sourceId` is `${messageId}:${agentId}` because one message can wake more
 * than one agent. The target agent is no longer derived from an
 * `ast-<userId>` convention — it comes out of `agentsToWake` (the two-member
 * thread here has exactly one other member, so it wakes with no @mention).
 */

import { agentRunConfig, agentWorkIntents, type HyperIdleDb, threads, users } from "@hyperidle/db";
import { getAgentIdentityIds, upsertAgentIdentity } from "@hyperidle/document";
import type { BakedAgentRunnableConfig } from "@hyperidle/domain-model";
import { readAgentRunConfig } from "@hyperidle/run-orchestration";
import { and, eq } from "drizzle-orm";
import type { Hono } from "hono";
import { beforeEach, describe, expect, vi } from "vitest";
/**
 * @lore AU31 §3.2/§5: the `coreApiSeamRegistration` auto-fixture used to
 * register this test's `app` on the `CoreApiPort` ambient global — deleted
 * (no ambient global left to register). This file never calls a tool
 * dispatch or the `CoreApiPort` seam directly (it drives real HTTP routes
 * only), so nothing here needs a seam transport at all.
 */
import { test } from "../__testing__/test-fixtures.js";

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
	// How the assistant RUNS. Who it is lives in its identity document below.
	await db.insert(agentRunConfig).values({
		agentUserId: ASSISTANT_ID,
		harnessType: "opencode",
		modelId: "deepseek/deepseek-v4-flash",
		modelProvider: "openrouter",
		maxConcurrentSessions: 1,
	});
	await upsertAgentIdentity(db, {
		agentId: ASSISTANT_ID,
		agentName: "Assistant",
		body: "Original row persona — the app default.",
		updatedBy: FOUNDER_ID,
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
 * Sends a message on the assistant thread through `send_message`, proves the
 * `thread_turn` intent was emitted for the woken assistant, and returns the
 * persona the drain will run that turn with — read through the production
 * `readAgentRunConfig`.
 */
async function postAndResolveTurnPersona(
	app: Hono,
	db: HyperIdleDb,
	clientKey: string,
): Promise<string | null> {
	const res = await app.request("/api/actions/send_message", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-API-Key": GATE_API_KEY,
		},
		body: JSON.stringify({
			threadId: THREAD_ID,
			text: `AR4b formation seam test (${clientKey})`,
			clientKey,
		}),
	});
	expect(res.status).toBe(200);
	const body = (await res.json()) as { data: { message: { id: string } } };
	const messageId = body.data.message.id;

	const [intent] = await db
		.select()
		.from(agentWorkIntents)
		.where(
			and(
				eq(agentWorkIntents.kind, "thread_turn"),
				eq(agentWorkIntents.sourceId, `${messageId}:${ASSISTANT_ID}`),
			),
		);
	expect(intent).toBeDefined();
	const baked = JSON.parse(intent?.bakedRequestJson ?? "{}") as {
		agentConfig?: BakedAgentRunnableConfig & { systemPrompt?: unknown };
	};
	expect(baked.agentConfig).toBeDefined();
	// The identity has ONE home. It is not a run-config field, so the old
	// `systemPrompt` spelling must not reappear anywhere on the request.
	expect(baked.agentConfig).not.toHaveProperty("systemPrompt");
	const runConfig = await readAgentRunConfig(db, ASSISTANT_ID);
	expect(runConfig).not.toHaveProperty("systemPrompt");

	// What `admitSession` (`provisioner.ts`) reads to build the "## Identity"
	// section of this turn's AGENTS.md.
	return baked.agentConfig?.persona ?? null;
}

describe("AR4b: formation seam — editing the assistant's identity document changes its next turn", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", GATE_API_KEY);
	});

	test("the seeded identity drives the turn when nothing has been edited", async ({ db, app }) => {
		await seedFixtures(db);

		const persona = await postAndResolveTurnPersona(app, db, "msg-ar4b-default");
		expect(persona).toBe("Original row persona — the app default.");
	});

	test("editing the identity document in Knowledge drives the NEXT turn (AC3)", async ({
		db,
		app,
	}) => {
		await seedFixtures(db);

		const before = await postAndResolveTurnPersona(app, db, "msg-ar4b-before-patch");
		expect(before).toBe("Original row persona — the app default.");

		// The one knowledge edit endpoint — the same one every other document is
		// edited through. There is no assistant-shaped side door any more.
		const identityId = (await getAgentIdentityIds(db, [ASSISTANT_ID])).get(ASSISTANT_ID);
		expect(identityId).toBeTruthy();
		const patchRes = await app.request(`/api/knowledge/${identityId}`, {
			method: "PATCH",
			headers: {
				"Content-Type": "application/json",
				"X-API-Key": GATE_API_KEY,
			},
			body: JSON.stringify({ version: 1, updatedBy: FOUNDER_ID, body: ALPHA_PERSONA }),
		});
		expect(patchRes.status).toBe(200);

		const after = await postAndResolveTurnPersona(app, db, "msg-ar4b-after-patch");
		expect(after).toBe(ALPHA_PERSONA);

		// Changing the formation response changes the assistant's form.
		expect(before).not.toBe(after);
	});
});
