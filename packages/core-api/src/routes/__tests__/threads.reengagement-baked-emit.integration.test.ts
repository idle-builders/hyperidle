/**
 * AU21 Increment 3, reengagement wave (RED) — architecture.md §6 Decision B /
 * §9 Increment 3: the REAL emit call site (`routes/threads.ts`'s `POST
 * /:threadId/messages/:messageId/verdict` handler, the `transitionProposedCall(
 * db, {to:"granted", ...})` call inside its `decision === "approve"` branch,
 * `proposed-call-workflow.ts:288-297`) must resolve + validate the
 * reengagement run AT EMIT TIME and bake the full request onto the
 * `agent_work_intents` row, instead of enqueuing a bare identity-only intent
 * for the drain to resolve later.
 *
 * Currently RED on two counts, both proven below:
 *   1. The emitted `reengagement` intent's `bakedRequestJson` is null today
 *      (the "granted" transition does not yet call the new reengagement
 *      resolver before recording).
 *   2. Because nothing is baked, the drain still falls through to
 *      `resolveIntentInputInternal`'s "reengagement" case at DRAIN time,
 *      which reads `review.findGrantedProposedCall`/`work.getTaskById`/
 *      `users.getUserById` — domain reads this migration must delete. Proven
 *      by wiring THOSE deps to throw and asserting the real emitted intent
 *      still hands off (it must not, today).
 */

import {
	agentWorkIntents,
	artifacts,
	bets,
	type HyperIdleDb,
	messages,
	proposedCalls,
	tasks,
	teamMembers,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { drainIntents } from "@hyperidle/session-requests";
import { eq } from "drizzle-orm";
import { describe, expect, vi } from "vitest";
import { queueDeps } from "../../services/durable-agent-queue.js";
import { test } from "../../test-fixtures.js";

const NOW = new Date().toISOString();

async function seedApprovableWorld(
	db: HyperIdleDb,
	idPrefix: string,
): Promise<{
	readonly threadId: string;
	readonly messageId: string;
	readonly taskId: string;
	readonly agentId: string;
	readonly teamId: string;
}> {
	const teamId = `${idPrefix}-team`;
	const betId = `${idPrefix}-bet`;
	const taskId = `${idPrefix}-task`;
	const agentId = `${idPrefix}-agent`;
	const threadId = `${idPrefix}-thread`;
	const messageId = `${idPrefix}-message`;
	const artifactId = `${idPrefix}-artifact`;

	await db.insert(teams).values({ id: teamId, name: teamId, phase: "build", createdAt: NOW });
	await db
		.insert(teamMembers)
		.values({ id: `${teamId}-members`, teamId, capacity: 5, activeBets: 0, formedAt: NOW });
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: "Agent",
		role: "builder",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(bets).values({
		id: betId,
		teamId,
		description: "Reengagement baked-emit test bet",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: taskId,
		betId,
		teamId,
		ownerAgentId: agentId,
		title: "Reengagement baked-emit test task",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(threads).values({
		id: threadId,
		hostKind: "bet",
		hostId: betId,
		initiatorId: agentId,
		participants: JSON.stringify([agentId]),
		lastActiveAt: NOW,
		createdAt: NOW,
	});
	await db.insert(messages).values({
		id: messageId,
		senderId: agentId,
		threadId,
		type: "review",
		payload: JSON.stringify({
			title: "Review",
			reasoning: ["reason"],
			artifactRef: { id: artifactId, kind: "action_operation" },
		}),
		clientKey: messageId,
		createdAt: NOW,
	});
	await db.insert(artifacts).values({
		id: artifactId,
		producingTaskId: taskId,
		kind: "action_operation",
		createdAt: NOW,
	});
	// The Proposed Call itself — captured (irreversible commit_file call staged
	// by the agent), NOT yet granted. The verdict endpoint's approve branch is
	// what transitions this to "granted" + composes the tailored grant + emits
	// the (this wave's target) `reengagement` intent.
	await db.insert(proposedCalls).values({
		id: `${idPrefix}-pc`,
		reviewMessageId: messageId,
		subjectThreadId: threadId,
		artifactId,
		originSessionId: `${idPrefix}-origin`,
		toolId: "commit_file",
		args: JSON.stringify({ path: "result.txt" }),
		identityHash: `${idPrefix}-hash`,
		reversibility: "irreversible",
		status: "captured",
		stagedByAgentId: agentId,
		createdAt: NOW,
	});

	return { threadId, messageId, taskId, agentId, teamId };
}

describe("reengagement is resolved and baked at emit time (POST /api/threads/:threadId/messages/:messageId/verdict)", () => {
	test("approving a review captures + grants the proposed call and bakes the reengagement request onto the recorded intent", async ({
		db,
		app,
	}) => {
		const { threadId, messageId, taskId, agentId, teamId } = await seedApprovableWorld(
			db,
			"au21-reengage-emit-1",
		);

		const res = await app.request(`/api/threads/${threadId}/messages/${messageId}/verdict`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ decision: "approve", rationale: "LGTM" }),
		});
		expect(res.status).toBe(200);

		const [intent] = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.kind, "reengagement"));
		expect(intent).toBeDefined();

		// RED today: `bakedRequestJson` is null — the "granted" transition does
		// not yet call the new reengagement resolver at emit time.
		expect(intent?.bakedRequestJson).toBeTruthy();
		const baked = intent?.bakedRequestJson
			? (JSON.parse(intent.bakedRequestJson) as Record<string, unknown>)
			: undefined;
		expect(baked).toMatchObject({
			defaultAgentId: agentId,
			sourceKind: "proposed_call",
			streamId: `task:${taskId}`,
			taskId,
			teamId,
			sourceCorrelation: {
				taskId,
				grantedAgentId: agentId,
			},
		});
	});

	test("the drain hands off the real emitted reengagement intent from its baked payload — ZERO review/work/users domain reads", async ({
		db,
		app,
		eventBus,
	}) => {
		await seedApprovableWorld(db, "au21-reengage-emit-2");

		const res = await app.request(
			"/api/threads/au21-reengage-emit-2-thread/messages/au21-reengage-emit-2-message/verdict",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ decision: "approve", rationale: "LGTM" }),
			},
		);
		expect(res.status).toBe(200);

		const base = queueDeps(db);
		const throwingFindGrantedProposedCall = vi.fn(async () => {
			throw new Error("zero-domain-read violation: review.findGrantedProposedCall was called");
		});
		const throwingGetTaskById = vi.fn(async () => {
			throw new Error("zero-domain-read violation: work.getTaskById was called");
		});
		const throwingGetUserById = vi.fn(async () => {
			throw new Error("zero-domain-read violation: users.getUserById was called");
		});
		const deps = {
			...base,
			eventBus,
			review: { ...base.review, findGrantedProposedCall: throwingFindGrantedProposedCall },
			work: { ...base.work, getTaskById: throwingGetTaskById },
			users: { ...base.users, getUserById: throwingGetUserById },
		};

		await drainIntents(deps);

		// RED today: the "granted" transition never baked a request, so the
		// drain falls through to the per-kind "reengagement" resolution, which
		// calls all three throwing spies.
		expect(throwingFindGrantedProposedCall.mock.calls.length).toBe(0);
		expect(throwingGetTaskById.mock.calls.length).toBe(0);
		expect(throwingGetUserById.mock.calls.length).toBe(0);

		const [intent] = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.kind, "reengagement"));
		expect(intent?.status).toBe("handed_off");
		expect(intent?.requestId).toBeTruthy();
	});
});
