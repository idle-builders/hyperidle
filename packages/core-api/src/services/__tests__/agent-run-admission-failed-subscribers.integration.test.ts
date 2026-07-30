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
 *   bet_decomposition -> work's existing markTerminal(betId,"blocked","failed")
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
import { drainIntents, enqueueWorkIntent } from "@hyperidle/session-requests";
import { and, eq } from "drizzle-orm";
import { describe, expect, test, vi } from "../../test-fixtures.js";
import { queueDeps } from "../durable-agent-queue.js";

const NOW = new Date().toISOString();

async function seedTeam(
	db: HyperIdleDb,
	id: string,
): Promise<{ teamId: string; membersId: string }> {
	const teamId = `${id}-team`;
	const membersId = `${id}-members`;
	await db.insert(teams).values({ id: teamId, name: id, phase: "build", createdAt: NOW });
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
		maxConcurrentSessions: 1,
		createdAt: NOW,
	});
}

describe("agent_run_admission_failed — per-kind core-api reactions", () => {
	test("routine_run: finalizes the run to outcome=error (replacing failOrRelease's deleted direct write)", async ({
		db,
		eventBus,
	}) => {
		const { teamId, membersId } = await seedTeam(db, "w0-sub-routine");
		await seedAgent(db, "w0-sub-routine-owner", { teamMembersId: membersId });
		await db.insert(routines).values({
			id: "w0-sub-routine",
			name: "Wave 0 subscriber routine",
			teamId,
			ownerAgentId: "w0-sub-routine-owner",
			triggerType: "manual",
			state: "active",
			active: false, // deactivated — forces InvalidAgentWorkSourceError at drain
		});
		const [run] = await db
			.insert(routineRuns)
			.values({
				id: "w0-sub-routine-run",
				routineId: "w0-sub-routine",
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
			idempotencyKey: "w0-sub-routine-run",
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

	test("task_run: marks the taskDispatchAttempts row failed", async ({ db, eventBus }) => {
		const { teamId, membersId } = await seedTeam(db, "w0-sub-task");
		// The dispatch attempt's agent is not runnable (paused) — forces
		// requireRunnableActor's InvalidAgentWorkSourceError at drain.
		await seedAgent(db, "w0-sub-task-agent", { teamMembersId: membersId, status: "paused" });
		await db.insert(bets).values({
			id: "w0-sub-task-bet",
			teamId,
			description: "Wave 0 subscriber bet",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(tasks).values({
			id: "w0-sub-task",
			betId: "w0-sub-task-bet",
			teamId,
			title: "Wave 0 subscriber task",
			state: "accepted",
			createdAt: NOW,
			updatedAt: NOW,
		});
		const [attempt] = await db
			.insert(taskDispatchAttempts)
			.values({
				id: "w0-sub-task-attempt",
				taskId: "w0-sub-task",
				occasion: "accepted",
				agentId: "w0-sub-task-agent",
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
	}) => {
		const { teamId, membersId } = await seedTeam(db, "w0-sub-start");
		// The requested agent is not runnable — forces InvalidAgentWorkSourceError.
		await seedAgent(db, "w0-sub-start-agent", { teamMembersId: membersId, status: "retired" });
		await db.insert(bets).values({
			id: "w0-sub-start-bet",
			teamId,
			description: "Wave 0 subscriber bet",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(tasks).values({
			id: "w0-sub-start-task",
			betId: "w0-sub-start-bet",
			teamId,
			title: "Wave 0 subscriber task",
			state: "accepted",
			createdAt: NOW,
			updatedAt: NOW,
		});
		const [start] = await db
			.insert(explicitSessionStarts)
			.values({
				id: "w0-sub-start",
				taskId: "w0-sub-start-task",
				requestedAgentId: "w0-sub-start-agent",
				requestedModelTier: "fast",
				requestedBy: "w0-sub-start-agent",
				idempotencyKey: "w0-sub-start-key",
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
			idempotencyKey: "w0-sub-start-intent",
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

	test("bet_decomposition: reuses markTerminal(betId, 'blocked', 'failed')", async ({
		db,
		eventBus,
	}) => {
		const { teamId } = await seedTeam(db, "w0-sub-bet");
		await db.insert(bets).values({
			id: "w0-sub-bet",
			teamId,
			description: "Wave 0 subscriber decomposition bet",
			status: "active",
			// decompositionStatus left null (not "running") — forces
			// InvalidAgentWorkSourceError ("Bet decomposition is no longer eligible").
			createdAt: NOW,
		});

		const deps = { ...queueDeps(db), eventBus };
		await enqueueWorkIntent(db, {
			kind: "bet_decomposition",
			sourceKind: "bet",
			sourceId: "w0-sub-bet",
			idempotencyKey: "w0-sub-bet-decomposition",
		});
		await drainIntents(deps);

		await vi.waitFor(async () => {
			const [finalized] = await db.select().from(bets).where(eq(bets.id, "w0-sub-bet"));
			expect(finalized?.decompositionStatus).toBe("blocked");
			expect(finalized?.decompositionBlockerReason).toBe("failed");
		});
	});

	test("knowledge_action: creates a review-flagged item, no run-record mutation", async ({
		db,
		eventBus,
	}) => {
		await seedAgent(db, "w0-sub-knowledge-agent");
		const [item] = await db
			.insert(knowledgeItems)
			.values({
				id: "w0-sub-knowledge-item",
				scopeKind: "factory",
				title: "Wave 0 subscriber item",
				body: "Body",
				format: "markdown",
				// archived — forces "Knowledge item is unavailable".
				status: "archived",
				updatedBy: "w0-sub-knowledge-agent",
				createdAt: NOW,
				updatedAt: NOW,
			})
			.returning();

		const deps = { ...queueDeps(db), eventBus };
		await enqueueWorkIntent(db, {
			kind: "knowledge_action",
			sourceKind: "knowledge_action",
			sourceId: `knowledge:${item?.id}`,
			idempotencyKey: "w0-sub-knowledge-action",
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
	}) => {
		const { teamId, membersId } = await seedTeam(db, "w0-sub-reengage");
		await seedAgent(db, "w0-sub-reengage-agent", { teamMembersId: membersId });
		await db.insert(bets).values({
			id: "w0-sub-reengage-bet",
			teamId,
			description: "Wave 0 subscriber reengagement bet",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(tasks).values({
			id: "w0-sub-reengage-task",
			betId: "w0-sub-reengage-bet",
			teamId,
			title: "Wave 0 subscriber task",
			state: "in_progress",
			createdAt: NOW,
			updatedAt: NOW,
		});
		await db.insert(threads).values({
			id: "w0-sub-reengage-thread",
			hostKind: "task",
			hostId: "w0-sub-reengage-task",
			initiatorId: "w0-sub-reengage-agent",
			participants: JSON.stringify(["w0-sub-reengage-agent"]),
			lastActiveAt: NOW,
			createdAt: NOW,
		});
		await db.insert(messages).values({
			id: "w0-sub-reengage-message",
			senderId: "w0-sub-reengage-agent",
			threadId: "w0-sub-reengage-thread",
			type: "review",
			payload: JSON.stringify({ title: "Approve", reasoning: ["needed"] }),
			clientKey: "w0-sub-reengage-message",
			createdAt: NOW,
		});
		await db.insert(artifacts).values({
			id: "w0-sub-reengage-artifact",
			producingTaskId: "w0-sub-reengage-task",
			kind: "action_operation",
			createdAt: NOW,
		});
		await db.insert(proposedCalls).values({
			id: "w0-sub-reengage-call",
			reviewMessageId: "w0-sub-reengage-message",
			subjectThreadId: "w0-sub-reengage-thread",
			artifactId: "w0-sub-reengage-artifact",
			originSessionId: "w0-sub-reengage-origin",
			toolId: "commit_file",
			args: JSON.stringify({ path: "result.txt" }),
			identityHash: "w0-sub-reengage-hash",
			reversibility: "irreversible",
			// held — forces "Proposed call grant is not eligible" (call.status !== "granted").
			status: "held",
			stagedByAgentId: "w0-sub-reengage-agent",
			createdAt: NOW,
		});
		await db.insert(tailoredGrants).values({
			proposedCallId: "w0-sub-reengage-call",
			taskScope: "w0-sub-reengage-task",
			agentScope: "w0-sub-reengage-agent",
			approvedToolId: "commit_file",
			approvedArgs: JSON.stringify({ path: "result.txt" }),
			retryCount: 0,
			mintedAt: NOW,
		});

		const deps = { ...queueDeps(db), eventBus };
		await enqueueWorkIntent(db, {
			kind: "reengagement",
			sourceKind: "proposed_call",
			sourceId: "w0-sub-reengage-call",
			idempotencyKey: "w0-sub-reengage-intent",
		});
		await drainIntents(deps);

		await vi.waitFor(async () => {
			const [grant] = await db
				.select()
				.from(tailoredGrants)
				.where(eq(tailoredGrants.proposedCallId, "w0-sub-reengage-call"));
			expect(grant?.retryCount).toBe(1);
			const retryIntents = await db
				.select()
				.from(agentWorkIntents)
				.where(
					and(
						eq(agentWorkIntents.kind, "reengagement"),
						eq(agentWorkIntents.sourceId, "w0-sub-reengage-call"),
					),
				);
			// The original + a fresh re-provision intent recorded by the liveness net.
			expect(retryIntents.length).toBeGreaterThanOrEqual(2);
		});
	});

	test("assistant_turn: informational only — no mutation of the source message", async ({
		db,
		eventBus,
	}) => {
		const now = NOW;
		await db.insert(users).values([
			{
				id: "w0-sub-assistant-human",
				kind: "human",
				name: "Human",
				role: "founder",
				status: "active",
				createdAt: now,
			},
			{
				id: "ast-w0-sub-assistant-human",
				kind: "ai",
				name: "Assistant",
				role: "assistant",
				status: "active",
				createdAt: now,
			},
		]);
		await db.insert(threads).values({
			id: "w0-sub-assistant-thread",
			hostKind: "user",
			hostId: "w0-sub-assistant-human",
			initiatorId: "w0-sub-assistant-human",
			participants: JSON.stringify(["w0-sub-assistant-human", "ast-w0-sub-assistant-human"]),
			lastActiveAt: now,
			createdAt: now,
		});
		await db.insert(messages).values({
			id: "w0-sub-assistant-message",
			senderId: "w0-sub-assistant-human",
			threadId: "w0-sub-assistant-thread",
			type: "plain",
			payload: JSON.stringify({ text: "hello" }),
			clientKey: "w0-sub-assistant-message",
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
			sourceId: "w0-sub-assistant-message",
			idempotencyKey: "w0-sub-assistant-intent",
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
			.where(eq(messages.id, "w0-sub-assistant-message"));
		expect(message?.deletedAt).toBe(now);
		expect(message?.redactedAt).toBeNull();
	});
});
