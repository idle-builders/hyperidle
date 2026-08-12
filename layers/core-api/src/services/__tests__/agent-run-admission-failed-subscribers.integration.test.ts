/**
 * AU21 Increment 3, Wave 0 (RED) — the seven core-api reactions to a
 * terminal `agent_run_admission_failed` event (architecture.md §10's full
 * per-`kind` subscriber table, §9 Increment 3's "Build agent_run_admission_failed
 * + core-api subscribers ... now even though most families' resolvers don't
 * exist yet").
 *
 * Every one of these scenarios drives the REAL, already-existing
 * `resolveIntentInputInternal` branch for that kind (none of the seven
 * resolvers are migrated in this wave — including `routine_run`, which stays
 * untouched all the way through Increment 3 per the scope note) into its
 * existing `InvalidAgentWorkSourceError` — a genuine pre-handoff failure,
 * exactly the shape the drain already produces today. What's NEW, and what
 * this file proves is currently MISSING, is the core-api-side REACTION once
 * that failure is reported back on `agent_run_admission_failed` with
 * `terminal: true`, per architecture.md §10's table:
 *
 *   routine_run       -> routine finalizes the run to outcome="error"
 *   task_run          -> work marks the taskDispatchAttempts row failed
 *   session_start     -> work marks the explicitSessionStarts row failed (no retry)
 *   knowledge_action  -> a review-flagged item is created (no run-record mutation)
 *   reengagement      -> review's existing retry-count liveness-net pattern
 *   assistant_turn     -> informational only, no mutation
 *
 * All seven are currently RED: the event isn't even emitted yet (see the
 * sibling `agent-run-admission-failed-emission.integration.test.ts`), so none
 * of these reactions can possibly have fired.
 *
 * @lore GREEN-phase wiring note: each reaction is registered as an
 * async-fire-and-forget `eventBus.on(...)` handler
 * (`registerAgentRunAdmissionReactions`) — the SAME pattern every other
 * EventBus reaction in this codebase uses (`EventHandler<T>` is strictly
 * `(event) => void`, so an async body can only be a detached promise; see
 * `lifecycle-propagation.ts`'s `@lore AF3 C9b`). `emit()` itself is
 * synchronous (guarantees the handler was CALLED), not that its internal
 * `await`s resolved before `drainIntents` returns. Every existing test in
 * this codebase asserting on such a reaction's effect wraps the assertion in
 * `vi.waitFor(...)` (see `lifecycle-propagation.integration.test.ts`) — these
 * seven do the same. The assertions themselves are unchanged from the
 * RED-phase author's report.
 */

import {
	agentWorkIntents,
	artifacts,
	bets,
	explicitSessionStarts,
	type HyperIdleDb,
	items,
	knowledgeAppProjection,
	knowledgeItems,
	messages,
	proposedCalls,
	routineRuns,
	routines,
	tailoredGrants,
	taskDispatchAttempts,
	tasks,
	teamMembers,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { attentionReviewReasoningMarker } from "@hyperidle/review";
import type { ScopedIds } from "@hyperidle/db/test-fixtures";
import { drainIntents, enqueueWorkIntent } from "@hyperidle/session-requests";
import { and, eq } from "drizzle-orm";
import { queueDeps } from "../../__testing__/durable-agent-queue-test-deps.js";
import { describe, expect, test, vi } from "../../__testing__/test-fixtures.js";

const NOW = new Date().toISOString();

async function seedTeam(
	db: HyperIdleDb,
	ids: ScopedIds,
	prefix: string,
): Promise<{ teamId: string; membersId: string }> {
	const teamId = ids(`${prefix}-team`);
	const membersId = ids(`${prefix}-members`);
	await db.insert(teams).values({ id: teamId, name: prefix, phase: "build", createdAt: NOW });
	await db
		.insert(teamMembers)
		.values({ id: membersId, teamId, capacity: 5, activeBets: 0, formedAt: NOW });
	return { teamId, membersId };
}

async function seedAgent(
	db: HyperIdleDb,
	id: string,
	opts: { readonly teamMembersId?: string; readonly status?: string } = {},
): Promise<void> {
	await db.insert(users).values({
		id,
		kind: "ai",
		name: "Agent",
		role: "builder",
		status: opts.status ?? "active",
		teamId: opts.teamMembersId,
		createdAt: NOW,
	});
}

describe("agent_run_admission_failed — per-kind core-api reactions", () => {
	test("routine_run: finalizes the run to outcome=error (replacing failOrRelease's deleted direct write)", async ({
		db,
		eventBus,
		ids,
	}) => {
		const { teamId, membersId } = await seedTeam(db, ids, "w0-sub-routine");
		const ownerAgentId = ids("w0-sub-routine-owner");
		await seedAgent(db, ownerAgentId, { teamMembersId: membersId });
		const routineId = ids("w0-sub-routine");
		await db.insert(routines).values({
			id: routineId,
			name: "Wave 0 subscriber routine",
			teamId,
			ownerAgentId,
			triggerType: "manual",
			state: "active",
			active: false, // deactivated — forces InvalidAgentWorkSourceError at drain
		});
		const [run] = await db
			.insert(routineRuns)
			.values({
				id: ids("w0-sub-routine-run"),
				routineId,
				startedAt: NOW,
				outcome: "running",
			})
			.returning();

		// AU21 §9 Increment 9: `DurableAgentQueueDeps.routine` (the surface
		// failOrRelease's OLD direct `updateRoutineRunIfRunning` write used) is
		// REMOVED entirely — confirmed zero real call sites anywhere in
		// `@hyperidle/session-requests`. There is no `deps.routine.*` path left
		// at all, so a passing assertion below can only come from a REAL
		// core-api subscriber reacting to the emitted event (which reaches the
		// `routineRuns` row through its own import, not through this deps
		// bundle) — a stronger guarantee than the no-op override this test
		// originally installed.
		const deps = { ...queueDeps(db), eventBus };
		await enqueueWorkIntent(db, {
			kind: "routine_run",
			sourceKind: "routine_run",
			sourceId: run?.id ?? "",
			idempotencyKey: ids("w0-sub-routine-run"),
		});
		await drainIntents(deps);

		await vi.waitFor(async () => {
			const [finalized] = await db
				.select()
				.from(routineRuns)
				.where(eq(routineRuns.id, run?.id ?? ""));
			expect(finalized?.outcome).toBe("error");
			expect(finalized?.endedAt).toBeTruthy();
		});
	});

	test("task_run: marks the taskDispatchAttempts row failed", async ({ db, eventBus, ids }) => {
		const { teamId, membersId } = await seedTeam(db, ids, "w0-sub-task");
		const agentId = ids("w0-sub-task-agent");
		const betId = ids("w0-sub-task-bet");
		const taskId = ids("w0-sub-task");
		const attemptId = ids("w0-sub-task-attempt");
		// The dispatch attempt's agent is not runnable (paused) — forces
		// requireRunnableActor's InvalidAgentWorkSourceError at drain.
		await seedAgent(db, agentId, { teamMembersId: membersId, status: "paused" });
		await db.insert(bets).values({
			id: betId,
			teamId,
			description: "Wave 0 subscriber bet",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(tasks).values({
			id: taskId,
			betId,
			teamId,
			title: "Wave 0 subscriber task",
			state: "accepted",
			createdAt: NOW,
			updatedAt: NOW,
		});
		const [attempt] = await db
			.insert(taskDispatchAttempts)
			.values({
				id: attemptId,
				taskId,
				occasion: "accepted",
				agentId,
				ordinal: 1,
				status: "requested",
				createdAt: NOW,
				updatedAt: NOW,
			})
			.returning();

		const deps = { ...queueDeps(db), eventBus };
		await enqueueWorkIntent(db, {
			kind: "task_run",
			sourceKind: "task_dispatch_attempt",
			sourceId: attempt?.id ?? "",
			idempotencyKey: "w0-sub-task-run",
		});
		await drainIntents(deps);

		await vi.waitFor(async () => {
			const [finalized] = await db
				.select()
				.from(taskDispatchAttempts)
				.where(eq(taskDispatchAttempts.id, attempt?.id ?? ""));
			expect(finalized?.status).toBe("failed");
		});
	});

	test("session_start: marks the explicitSessionStarts row failed, no automatic retry", async ({
		db,
		eventBus,
		ids,
	}) => {
		const { teamId, membersId } = await seedTeam(db, ids, "w0-sub-start");
		const agentId = ids("w0-sub-start-agent");
		const betId = ids("w0-sub-start-bet");
		const taskId = ids("w0-sub-start-task");
		const startId = ids("w0-sub-start");
		// The requested agent is not runnable — forces InvalidAgentWorkSourceError.
		await seedAgent(db, agentId, { teamMembersId: membersId, status: "retired" });
		await db.insert(bets).values({
			id: betId,
			teamId,
			description: "Wave 0 subscriber bet",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(tasks).values({
			id: taskId,
			betId,
			teamId,
			title: "Wave 0 subscriber task",
			state: "accepted",
			createdAt: NOW,
			updatedAt: NOW,
		});
		const [start] = await db
			.insert(explicitSessionStarts)
			.values({
				id: startId,
				taskId,
				requestedAgentId: agentId,
				requestedModelTier: "fast",
				requestedBy: agentId,
				idempotencyKey: ids("w0-sub-start-key"),
				status: "requested",
				createdAt: NOW,
				updatedAt: NOW,
			})
			.returning();

		const deps = { ...queueDeps(db), eventBus };
		await enqueueWorkIntent(db, {
			kind: "session_start",
			sourceKind: "explicit_session_start",
			sourceId: start?.id ?? "",
			idempotencyKey: ids("w0-sub-start-intent"),
		});
		await drainIntents(deps);

		await vi.waitFor(async () => {
			const [finalized] = await db
				.select()
				.from(explicitSessionStarts)
				.where(eq(explicitSessionStarts.id, start?.id ?? ""));
			expect(finalized?.status).toBe("failed");
			expect(finalized?.failureCode).toBeTruthy();
		});
	});

	test("knowledge_action: creates a review-flagged item, no run-record mutation", async ({
		db,
		eventBus,
		ids,
	}) => {
		const agentId = ids("w0-sub-knowledge-agent");
		const itemId = ids("w0-sub-knowledge-item");
		await seedAgent(db, agentId);
		const [item] = await db
			.insert(knowledgeItems)
			.values({
				id: itemId,
				scopeKind: "factory",
				title: "Wave 0 subscriber item",
				body: "Body",
				format: "markdown",
				// archived — forces "Knowledge item is unavailable".
				status: "archived",
				updatedBy: agentId,
				createdAt: NOW,
				updatedAt: NOW,
			})
			.returning();
		// The owner writes the projection row alongside the item.
		await db.insert(knowledgeAppProjection).values({
			id: ids("w0-sub-knowledge-item-projection"),
			knowledgeItemId: itemId,
		});

		const deps = { ...queueDeps(db), eventBus };
		await enqueueWorkIntent(db, {
			kind: "knowledge_action",
			sourceKind: "knowledge_action",
			sourceId: `knowledge:${item?.id}`,
			idempotencyKey: ids("w0-sub-knowledge-action"),
		});
		await drainIntents(deps);

		await vi.waitFor(async () => {
			const reviewItems = await db.select().from(items);
			const marker = attentionReviewReasoningMarker(item?.id ?? "");
			const flagged = reviewItems.find((row) => (row.reasoning ?? "").includes(marker));
			expect(flagged).toBeDefined();
		});
		// No durable "run" record exists for a knowledge action — nothing else to
		// assert about the knowledge item itself changing state.
		const [reloadedItem] = await db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, item?.id ?? ""));
		expect(reloadedItem?.status).toBe("archived");
	});

	test("reengagement: reuses the existing retry-count liveness-net pattern", async ({
		db,
		eventBus,
		ids,
	}) => {
		const { teamId, membersId } = await seedTeam(db, ids, "w0-sub-reengage");
		const agentId = ids("w0-sub-reengage-agent");
		const betId = ids("w0-sub-reengage-bet");
		const taskId = ids("w0-sub-reengage-task");
		const threadId = ids("w0-sub-reengage-thread");
		const messageId = ids("w0-sub-reengage-message");
		const artifactId = ids("w0-sub-reengage-artifact");
		const callId = ids("w0-sub-reengage-call");
		await seedAgent(db, agentId, { teamMembersId: membersId });
		await db.insert(bets).values({
			id: betId,
			teamId,
			description: "Wave 0 subscriber reengagement bet",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(tasks).values({
			id: taskId,
			betId,
			teamId,
			title: "Wave 0 subscriber task",
			state: "in_progress",
			createdAt: NOW,
			updatedAt: NOW,
		});
		await db.insert(threads).values({
			id: threadId,
			hostKind: "task",
			hostId: taskId,
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
			payload: JSON.stringify({ title: "Approve", reasoning: ["needed"] }),
			clientKey: messageId,
			createdAt: NOW,
		});
		await db.insert(artifacts).values({
			id: artifactId,
			producingTaskId: taskId,
			kind: "action_operation",
			createdAt: NOW,
		});
		await db.insert(proposedCalls).values({
			id: callId,
			reviewMessageId: messageId,
			subjectThreadId: threadId,
			artifactId,
			originSessionId: ids("w0-sub-reengage-origin"),
			toolId: "commit_file",
			args: JSON.stringify({ path: "result.txt" }),
			identityHash: ids("w0-sub-reengage-hash"),
			reversibility: "irreversible",
			// held — forces "Proposed call grant is not eligible" (call.status !== "granted").
			status: "held",
			stagedByAgentId: agentId,
			createdAt: NOW,
		});
		await db.insert(tailoredGrants).values({
			proposedCallId: callId,
			taskScope: taskId,
			agentScope: agentId,
			approvedToolId: "commit_file",
			approvedArgs: JSON.stringify({ path: "result.txt" }),
			retryCount: 0,
			mintedAt: NOW,
		});

		const deps = { ...queueDeps(db), eventBus };
		await enqueueWorkIntent(db, {
			kind: "reengagement",
			sourceKind: "proposed_call",
			sourceId: callId,
			idempotencyKey: ids("w0-sub-reengage-intent"),
		});
		await drainIntents(deps);

		await vi.waitFor(async () => {
			const [grant] = await db
				.select()
				.from(tailoredGrants)
				.where(eq(tailoredGrants.proposedCallId, callId));
			expect(grant?.retryCount).toBe(1);
			const retryIntents = await db
				.select()
				.from(agentWorkIntents)
				.where(
					and(
						eq(agentWorkIntents.kind, "reengagement"),
						eq(agentWorkIntents.sourceId, callId),
					),
				);
			// The original + a fresh re-provision intent recorded by the liveness net.
			expect(retryIntents.length).toBeGreaterThanOrEqual(2);
		});
	});

	test("assistant_turn: informational only — no mutation of the source message", async ({
		db,
		eventBus,
		ids,
	}) => {
		const now = NOW;
		const humanId = ids("w0-sub-assistant-human");
		const assistantAgentId = `ast-${humanId}`;
		const threadId = ids("w0-sub-assistant-thread");
		const messageId = ids("w0-sub-assistant-message");
		await db.insert(users).values([
			{
				id: humanId,
				kind: "human",
				name: "Human",
				role: "founder",
				status: "active",
				createdAt: now,
			},
			{
				id: assistantAgentId,
				kind: "ai",
				name: "Assistant",
				role: "assistant",
				status: "active",
				createdAt: now,
			},
		]);
		await db.insert(threads).values({
			id: threadId,
			hostKind: "user",
			hostId: humanId,
			initiatorId: humanId,
			participants: JSON.stringify([humanId, assistantAgentId]),
			lastActiveAt: now,
			createdAt: now,
		});
		await db.insert(messages).values({
			id: messageId,
			senderId: humanId,
			threadId,
			type: "plain",
			payload: JSON.stringify({ text: "hello" }),
			clientKey: messageId,
			// deletedAt set — forces "Assistant source message is unavailable".
			deletedAt: now,
			createdAt: now,
		});

		const deps = { ...queueDeps(db), eventBus };
		const emitted: Array<{ readonly kind?: string; readonly terminal?: boolean }> = [];
		eventBus.on("agent_run_admission_failed", (event) => {
			emitted.push(event as { readonly kind?: string; readonly terminal?: boolean });
		});
		await enqueueWorkIntent(db, {
			kind: "assistant_turn",
			sourceKind: "thread_message",
			sourceId: messageId,
			idempotencyKey: ids("w0-sub-assistant-intent"),
		});
		await expect(drainIntents(deps)).resolves.not.toThrow();

		// The reaction itself is a no-op (lowest-stakes family, informational
		// only per §10's table) — what's provably NEW is that the event still
		// fires for this kind, same as every other kind.
		expect(emitted).toHaveLength(1);
		expect(emitted[0]).toMatchObject({ kind: "assistant_turn", terminal: true });

		const [message] = await db
			.select()
			.from(messages)
			.where(eq(messages.id, messageId));
		expect(message?.deletedAt).toBe(now);
		expect(message?.redactedAt).toBeNull();
	});
});
