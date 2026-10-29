/**
 * send_message: tryDeliverToActiveRun short-circuits the work-intent path
 * for agents with an active run in the conversation.
 */

import { threads } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { vi } from "vitest";
import { createThreadActions } from "../thread-actions.js";
import { actionFor, ctxFor, seedAgent, seedHuman, seedTeam, threadDeps } from "./_helpers.js";

const TEAM_ID = "team-deliver";
const AGENT_ID = "agent-deliver";
const HUMAN_ID = "human-deliver";

describe("send_message — tryDeliverToActiveRun", () => {
	test("delivers directly to active run instead of recording a work intent", async ({ db }) => {
		await seedTeam(db, TEAM_ID);
		await seedHuman(db, HUMAN_ID, TEAM_ID);
		await seedAgent(db, AGENT_ID, TEAM_ID);

		// Create a thread with both the human and agent as members
		const threadId = "thr-deliver-1";
		await db.insert(threads).values({
			id: threadId,
			hostKind: "team",
			hostId: TEAM_ID,
			initiatorId: HUMAN_ID,
			participants: JSON.stringify([HUMAN_ID, AGENT_ID]),
			createdAt: new Date().toISOString(),
			lastActiveAt: new Date().toISOString(),
		});

		const deliverSpy = vi.fn(async () => "delivered" as const);
		const intentSpy = vi.fn(async (input: { idempotencyKey: string }) => ({
			id: "fake",
			idempotencyKey: input.idempotencyKey,
		}));

		const deps = threadDeps({
			agentWorkIntentRecorder: intentSpy,
			tryDeliverToActiveRun: deliverSpy,
		});

		const actions = createThreadActions(deps);
		const sendMessage = actionFor<
			import("@hyperidle/domain-model").SendMessageInput,
			import("@hyperidle/domain-model").SendMessageOutput
		>(actions, "send_message");

		const result = await sendMessage.run(ctxFor(db, HUMAN_ID), {
			threadId,
			text: "hello from human",
		});

		expect(result.ok).toBe(true);

		// Agent has active run — deliver was called, intent was NOT recorded
		expect(deliverSpy).toHaveBeenCalledWith(AGENT_ID, threadId, "hello from human");
		expect(intentSpy).not.toHaveBeenCalled();
	});

	test("falls back to intent recording when tryDeliverToActiveRun returns not_delivered", async ({
		db,
	}) => {
		await seedTeam(db, TEAM_ID);
		await seedHuman(db, HUMAN_ID, TEAM_ID);
		await seedAgent(db, AGENT_ID, TEAM_ID);

		const threadId = "thr-deliver-2";
		await db.insert(threads).values({
			id: threadId,
			hostKind: "team",
			hostId: TEAM_ID,
			initiatorId: HUMAN_ID,
			participants: JSON.stringify([HUMAN_ID, AGENT_ID]),
			createdAt: new Date().toISOString(),
			lastActiveAt: new Date().toISOString(),
		});

		const intentSpy = vi.fn(async (input: { idempotencyKey: string }) => ({
			id: "fake",
			idempotencyKey: input.idempotencyKey,
		}));

		const deps = threadDeps({
			agentWorkIntentRecorder: intentSpy,
			tryDeliverToActiveRun: async () => "not_delivered" as const,
		});

		const actions = createThreadActions(deps);
		const sendMessage = actionFor<
			import("@hyperidle/domain-model").SendMessageInput,
			import("@hyperidle/domain-model").SendMessageOutput
		>(actions, "send_message");

		const result = await sendMessage.run(ctxFor(db, HUMAN_ID), {
			threadId,
			text: "hello again",
		});

		expect(result.ok).toBe(true);
		// Delivery failed → intent recorded
		expect(intentSpy).toHaveBeenCalledTimes(1);
	});

	test("records intent as usual when tryDeliverToActiveRun is absent from deps", async ({ db }) => {
		await seedTeam(db, TEAM_ID);
		await seedHuman(db, HUMAN_ID, TEAM_ID);
		await seedAgent(db, AGENT_ID, TEAM_ID);

		const threadId = "thr-deliver-3";
		await db.insert(threads).values({
			id: threadId,
			hostKind: "team",
			hostId: TEAM_ID,
			initiatorId: HUMAN_ID,
			participants: JSON.stringify([HUMAN_ID, AGENT_ID]),
			createdAt: new Date().toISOString(),
			lastActiveAt: new Date().toISOString(),
		});

		const intentSpy = vi.fn(async (input: { idempotencyKey: string }) => ({
			id: "fake",
			idempotencyKey: input.idempotencyKey,
		}));

		const deps = threadDeps({ agentWorkIntentRecorder: intentSpy });

		const actions = createThreadActions(deps);
		const sendMessage = actionFor<
			import("@hyperidle/domain-model").SendMessageInput,
			import("@hyperidle/domain-model").SendMessageOutput
		>(actions, "send_message");

		await sendMessage.run(ctxFor(db, HUMAN_ID), { threadId, text: "hi" });
		expect(intentSpy).toHaveBeenCalledTimes(1);
	});
});
