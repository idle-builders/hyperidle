/**
 * AU21 Increment 3, reengagement wave — architecture.md §6 Decision B /
 * §9 Increment 3: the REAL emit call site (`routes/threads.ts`'s `POST
 * /:threadId/messages/:messageId/verdict` handler, the `transitionProposedCall(
 * db, {to:"granted", ...})` call inside its `decision === "approve"` branch,
 * `proposed-call-workflow.ts:288-297`) must resolve + validate the
 * reengagement run AT EMIT TIME and bake the full request onto the
 * `agent_work_intents` row, instead of enqueuing a bare identity-only intent
 * for the drain to resolve later.
 *
 * GREEN (was RED when first written): both counts below now hold.
 *   1. The emitted `reengagement` intent's `bakedRequestJson` is populated at
 *      emit time.
 *   2. `resolveIntentInputInternal`'s old "reengagement" per-kind drain-time
 *      resolution (which used to read `review.findGrantedProposedCall`/
 *      `work.getTaskById`/`users.getUserById`) is DELETED, not merely
 *      unreachable — AU21 §9 Increment 9 removed the dead `review`/
 *      `work.getTaskById`/`users.getUserById` fields from
 *      `DurableAgentQueueDeps` entirely (confirmed zero real call sites left
 *      anywhere in `@hyperidle/session-requests`), so the type system itself
 *      now proves zero domain reads — a stronger guarantee than the
 *      throwing-spy wiring this test originally used.
 */

import {
	agentWorkIntents,
	artifacts,
	bets,
	filesystemInjections,
	filesystems,
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
import { and, eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import { queueDeps } from "../../__testing__/durable-agent-queue-test-deps.js";
import { test } from "../../__testing__/test-fixtures.js";

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
	readonly proposedCallId: string;
}> {
	const teamId = `${idPrefix}-team`;
	const betId = `${idPrefix}-bet`;
	const taskId = `${idPrefix}-task`;
	const agentId = `${idPrefix}-agent`;
	const threadId = `${idPrefix}-thread`;
	const messageId = `${idPrefix}-message`;
	const artifactId = `${idPrefix}-artifact`;
	const proposedCallId = `${idPrefix}-pc`;

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
		id: proposedCallId,
		reviewMessageId: messageId,
		subjectThreadId: threadId,
		artifactId,
		originSessionId: `${idPrefix}-origin`,
		// Derived from the scoped prefix (AU38 R1): the grant composition pairs
		// approvedToolId with this same value (proposed-call-workflow.ts:607),
		// so nothing downstream relies on a fixed tool-name literal here.
		toolId: `${idPrefix}-tool`,
		args: JSON.stringify({ path: "result.txt" }),
		identityHash: `${idPrefix}-hash`,
		reversibility: "irreversible",
		status: "captured",
		stagedByAgentId: agentId,
		createdAt: NOW,
	});

	return { threadId, messageId, taskId, agentId, teamId, proposedCallId };
}

/**
 * @lore AU38: the intent select is scoped to this test's proposed call
 * (sourceId = proposedCallId, proposed-call-workflow.ts:586) — in a populated
 * world other tests' reengagement intents exist, and `.where(kind)` alone
 * would read them.
 */
async function findReengagementIntent(db: HyperIdleDb, proposedCallId: string) {
	const [intent] = await db
		.select()
		.from(agentWorkIntents)
		.where(
			and(eq(agentWorkIntents.kind, "reengagement"), eq(agentWorkIntents.sourceId, proposedCallId)),
		);
	return intent;
}

describe("reengagement is resolved and baked at emit time (POST /api/threads/:threadId/messages/:messageId/verdict)", () => {
	test("approving a review captures + grants the proposed call and bakes the reengagement request onto the recorded intent", async ({
		db,
		app,
		ids,
	}) => {
		const { threadId, messageId, taskId, agentId, teamId, proposedCallId } =
			await seedApprovableWorld(db, ids("au21-reengage-emit-1"));

		const res = await app.request(`/api/threads/${threadId}/messages/${messageId}/verdict`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ decision: "approve", rationale: "LGTM" }),
		});
		expect(res.status).toBe(200);

		const intent = await findReengagementIntent(db, proposedCallId);
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

	test("approving a review for an agent with an injected filesystem carries NOTHING about filesystems on the emitted intent", async ({
		db,
		app,
		ids,
	}) => {
		const prefix = ids("au21-reengage-emit-fs");
		const { threadId, messageId, agentId, teamId, proposedCallId } = await seedApprovableWorld(
			db,
			prefix,
		);

		await db.insert(filesystems).values({
			id: `${prefix}-repo`,
			teamId,
			source: "local",
			kind: "code",
			connectionId: null,
			resourceRef: JSON.stringify({ kind: "code", repo: "org/repo", branch: "main" }),
			writeback: "git",
			state: "attached",
			createdAt: NOW,
		});
		await db.insert(filesystemInjections).values({
			agentUserId: agentId,
			filesystemId: `${prefix}-repo`,
			createdAt: NOW,
		});

		const res = await app.request(`/api/threads/${threadId}/messages/${messageId}/verdict`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ decision: "approve", rationale: "LGTM" }),
		});
		expect(res.status).toBe(200);

		const intent = await findReengagementIntent(db, proposedCallId);
		expect(intent?.bakedRequestJson).toBeTruthy();

		// @lore AU26 F2: this used to assert the opposite — that the "granted"
		// branch baked the agent's full injected-filesystem list onto the intent,
		// because forgetting to forward that one dep left session 2's Phase 4.5
		// mounting nothing. The bake is DELETED: the spawn reads the injection
		// record live and in-layer, so there is no per-site dep left to forget
		// and no snapshot left to go stale. See
		// `filesystems-added-after-emit.integration.test.ts`.
		expect(intent?.bakedRequestJson ?? "").not.toContain("injectedFilesystems");
	});

	// @lore AU26 E3: the K1 test that lived here proved this emit site baked
	// the owning human's held connections onto the intent. That bake is
	// deleted — connections are read live at spawn — so there is nothing
	// left for this site to forget. See
	// `connections-added-after-emit.integration.test.ts`.

	test("the drain hands off the real emitted reengagement intent from its baked payload — ZERO review/work/users domain reads", async ({
		db,
		app,
		eventBus,
		ids,
	}) => {
		const { threadId, messageId, proposedCallId } = await seedApprovableWorld(
			db,
			ids("au21-reengage-emit-2"),
		);

		const res = await app.request(`/api/threads/${threadId}/messages/${messageId}/verdict`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ decision: "approve", rationale: "LGTM" }),
		});
		expect(res.status).toBe(200);

		// `DurableAgentQueueDeps` no longer HAS a `review`/`work.getTaskById`/
		// `users.getUserById` field at all (AU21 §9 Increment 9 deleted the dead
		// composition) — the drain can only ever hand off from the baked
		// payload; there is no domain-read fallback left to wire a throwing spy
		// onto.
		const deps = { ...queueDeps(db), eventBus };

		await drainIntents(deps);

		const intent = await findReengagementIntent(db, proposedCallId);
		expect(intent?.status).toBe("handed_off");
		expect(intent?.requestId).toBeTruthy();
	});
});
