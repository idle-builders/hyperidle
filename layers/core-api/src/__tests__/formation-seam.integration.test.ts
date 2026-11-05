/**
 * Formation seam: the assistant's identity is decided from editable state at
 * turn time, NOT a hardcoded constant. The persona lives in an `agent_file`
 * document bound to the agent (core-owned state) and rides the bake, exactly
 * like the context bundle beside it — the provisioner consumes a baked
 * bundle and reads zero core-api state.
 *
 * Changing the identity changes what the assistant's next turn runs with:
 * send a message through `send_message` -> a `thread_turn` intent is emitted
 * for the woken agent (via `agentsToWake` — the two-member thread here has
 * exactly one other member, so it wakes with no @mention); edit the
 * identity; send again; the persona read back off the bake reflects the
 * edit. The run config never carries a persona: one home for the identity,
 * not two.
 */

import { agentRunConfig, type HyperIdleDb, threads, users } from "@hyperidle/db";
import { readAgentRunConfig } from "@hyperidle/run-orchestration";
import type { Hono } from "hono";
import { beforeEach, describe, expect, vi } from "vitest";
import { listInboxRows } from "../../user/src/subscriptions-store.js";
import {
	makeAgentIdentityTestPort,
	makeDocumentReadPorts,
} from "../__testing__/document-read-test-ports.js";
// This file drives real HTTP routes only, never a tool dispatch or the
// `CoreApiPort` seam directly, so nothing here needs a seam transport.
import { test } from "../__testing__/test-fixtures.js";
import { buildStandaloneDocumentRunners } from "../actions/compose.js";

const agentIdentity = makeAgentIdentityTestPort();

const FOUNDER_ID = "founder-formation";
const ASSISTANT_ID = `ast-${FOUNDER_ID}`;
const THREAD_ID = "thread-formation";
const GATE_API_KEY = "formation-key";
const ALPHA_PERSONA = "test-persona-alpha — you are the Alpha test assistant.";

async function seedFixtures(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(users).values({
		id: FOUNDER_ID,
		name: "Formation Founder",
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
	await agentIdentity.upsertAgentIdentity(db, {
		agentId: ASSISTANT_ID,
		title: "Assistant — identity",
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
 * Sends a message on the assistant thread through `send_message`, proves an
 * inbox row was created for the assistant (the turn was triggered), and
 * returns the persona the inbox runner will read at session creation time —
 * the current body of the agent's identity document.
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
			text: `formation seam test (${clientKey})`,
			clientKey,
		}),
	});
	expect(res.status).toBe(200);
	const body = (await res.json()) as { data: { message: { id: string } } };
	const messageId = body.data.message.id;

	// The inbox row for this specific message proves the agent was woken.
	const agentInboxRows = await listInboxRows(db, { userId: ASSISTANT_ID });
	const thisMessageRow = agentInboxRows.find(
		(r) => r.reason === "message" && r.key === `message:${messageId}`,
	);
	expect(thisMessageRow).toBeDefined();

	// The formation seam: the inbox runner reads the identity document at
	// session creation time. The persona is the current document body.
	const { getAgentIdentity } = makeDocumentReadPorts(
		buildStandaloneDocumentRunners().searchDocuments,
	);
	const persona = await getAgentIdentity(db, ASSISTANT_ID);

	// The old systemPrompt spelling must not appear on the run config.
	const runConfig = await readAgentRunConfig(db, ASSISTANT_ID);
	expect(runConfig).not.toHaveProperty("systemPrompt");

	return persona;
}

describe("formation seam — editing the assistant's identity document changes its next turn", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", GATE_API_KEY);
	});

	test("the seeded identity drives the turn when nothing has been edited", async ({
		db,
		app,
		asPerson,
	}) => {
		await seedFixtures(db);
		await asPerson(FOUNDER_ID);

		const persona = await postAndResolveTurnPersona(app, db, "msg-formation-default");
		expect(persona).toBe("Original row persona — the app default.");
	});

	test("editing the identity document in Knowledge drives the NEXT turn", async ({
		db,
		app,
		asPerson,
	}) => {
		await seedFixtures(db);
		await asPerson(FOUNDER_ID);

		const before = await postAndResolveTurnPersona(app, db, "msg-formation-before-patch");
		expect(before).toBe("Original row persona — the app default.");

		// The one document edit door — the same one every other document is
		// edited through. There is no assistant-shaped side door any more.
		const identityId = (await agentIdentity.identityIdsFor(db, FOUNDER_ID, [ASSISTANT_ID])).get(
			ASSISTANT_ID,
		);
		expect(identityId).toBeTruthy();
		const patchRes = await app.request("/api/actions/edit_document", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-API-Key": GATE_API_KEY,
			},
			body: JSON.stringify({ id: identityId, version: 1, body: ALPHA_PERSONA }),
		});
		expect(patchRes.status).toBe(200);

		const after = await postAndResolveTurnPersona(app, db, "msg-formation-after-patch");
		expect(after).toBe(ALPHA_PERSONA);

		// Changing the formation response changes the assistant's form.
		expect(before).not.toBe(after);
	});
});
