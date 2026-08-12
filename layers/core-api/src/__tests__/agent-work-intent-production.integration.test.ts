import {
	agentRunConfig,
	agentSessionRequests,
	agentWorkIntents,
	artifacts,
	bets,
	explicitSessionStarts,
	type HyperIdleDb,
	knowledgeEditLog,
	knowledgeItems,
	messages,
	proposedCalls,
	routineRuns,
	routines,
	sessions,
	taskDispatchAttempts,
	tasks,
	teamMembers,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import type { ScopedIds } from "@hyperidle/db/test-fixtures";
import { transitionProposedCall } from "@hyperidle/review";
import { drainIntents, enqueueWorkIntent } from "@hyperidle/session-requests";
import { requireRunnableAgent } from "@hyperidle/users";
import { checkAndUnblockDependents } from "@hyperidle/work";
import { and, eq, sql } from "drizzle-orm";
import { queueDeps } from "../__testing__/durable-agent-queue-test-deps.js";
import { afterEach, beforeEach, describe, expect, test, vi } from "../__testing__/test-fixtures.js";
import { fireGenericRoutine } from "./dispatch-test-helpers.js";

/** AU20 Ag2: `checkAndUnblockDependents` relocated to work; `work:` sub-object removed. */
const depWatcherDeps = {
	workIntents: { record: enqueueWorkIntent },
	taskRunResolver: { requireRunnableAgent },
};

const authHeaders = {
	"Content-Type": "application/json",
	"X-API-Key": "test-api-key",
};

async function seedExplicitSessionAuthority(
	db: HyperIdleDb,
	ids: ScopedIds,
): Promise<{
	teamId: string;
	memberId: string;
	humanId: string;
	agentId: string;
	betId: string;
	taskId: string;
}> {
	await db.execute(sql`drop trigger if exists au9_reject_intent_write on agent_work_intents`);
	const now = new Date().toISOString();
	const teamId = ids("au9-production-team");
	const memberId = ids("au9-production-membership");
	const humanId = ids("au9-production-human");
	const agentId = ids("au9-production-agent");
	const betId = ids("au9-production-bet");
	const taskId = ids("au9-production-task");
	await db.insert(teams).values({ id: teamId, name: "AU9", phase: "build", createdAt: now });
	await db.insert(teamMembers).values({
		id: memberId,
		teamId: teamId,
		capacity: 2,
		activeBets: 0,
		formedAt: now,
	});
	await db.insert(users).values([
		{
			id: humanId,
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			createdAt: now,
		},
		{
			id: agentId,
			kind: "ai",
			name: "Builder",
			role: "builder",
			status: "active",
			teamId: memberId,
			createdAt: now,
		},
	]);
	await db.insert(bets).values({
		id: betId,
		teamId: teamId,
		description: "Atomic handoff",
		appetite: "small",
		status: "active",
		createdAt: now,
	});
	await db.insert(tasks).values({
		id: taskId,
		betId: betId,
		teamId: teamId,
		title: "Atomic handoff",
		state: "in_progress",
		createdAt: now,
		updatedAt: now,
	});
	return { teamId, memberId, humanId, agentId, betId, taskId };
}

async function seedProposedCallWorld(
	db: HyperIdleDb,
	ids: ScopedIds,
): Promise<ReturnType<typeof seedExplicitSessionAuthority> extends Promise<infer R> ? R : never> {
	const scope = await seedExplicitSessionAuthority(db, ids);
	const now = new Date().toISOString();
	await db.insert(artifacts).values({
		id: ids("au9-production-artifact"),
		producingTaskId: scope.taskId,
		kind: "action_operation",
		createdAt: now,
	});
	await db.insert(threads).values({
		id: ids("au9-production-thread"),
		hostKind: "bet",
		hostId: scope.betId,
		initiatorId: scope.agentId,
		participants: JSON.stringify([scope.agentId]),
		lastActiveAt: now,
		createdAt: now,
	});
	await db.insert(messages).values({
		id: ids("au9-production-review-message"),
		senderId: scope.agentId,
		threadId: ids("au9-production-thread"),
		type: "review",
		payload: JSON.stringify({ title: "Approve", reasoning: ["needed"] }),
		clientKey: ids("au9-production-review-message"),
		createdAt: now,
	});
	await db.insert(proposedCalls).values({
		id: ids("au9-production-call"),
		reviewMessageId: ids("au9-production-review-message"),
		subjectThreadId: ids("au9-production-thread"),
		artifactId: ids("au9-production-artifact"),
		originSessionId: ids("au9-production-origin"),
		toolId: ids("commit_file"),
		args: JSON.stringify({ path: "result.txt" }),
		identityHash: ids("au9-production-hash"),
		reversibility: "irreversible",
		status: "captured",
		stagedByAgentId: scope.agentId,
		createdAt: now,
	});
	return scope;
}

async function rejectIntentWrites(db: HyperIdleDb) {
	await db.execute(sql`drop trigger if exists au9_reject_intent_write on agent_work_intents`);
	await db.execute(sql`
		create or replace function au9_reject_intent_write() returns trigger as $$
		begin raise exception 'AU9 injected intent write failure'; end;
		$$ language plpgsql
	`);
	await db.execute(sql`
		create trigger au9_reject_intent_write
		before insert on agent_work_intents
		for each row execute function au9_reject_intent_write()
	`);
}

async function seedAssistantThread(
	db: HyperIdleDb,
	ids: ScopedIds,
): Promise<{ humanId: string; assistantId: string; threadId: string }> {
	const now = new Date().toISOString();
	const humanId = ids("au9-assistant-human");
	// @lore AU38: `isAssistantThread` (routes/threads.ts) checks
	// `participants.some(p => p === \`ast-${hostId}\`)` — the assistant's user id
	// MUST be `ast-<humanId>`, not an independent scoped id.
	const assistantId = `ast-${humanId}`;
	const threadId = ids("au9-assistant-thread");
	await db.insert(users).values([
		{
			id: humanId,
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			createdAt: now,
		},
		{
			id: assistantId,
			kind: "ai",
			name: "Assistant",
			role: "assistant",
			status: "active",
			createdAt: now,
		},
	]);
	// AU26 G1: the run config lives in its own table now.
	await db.insert(agentRunConfig).values({
		agentUserId: assistantId,
		harnessType: "builtin",
		modelId: ids("au9-assistant-model"),
		modelProvider: "openrouter",
	});
	await db.insert(threads).values({
		id: threadId,
		hostKind: "user",
		hostId: humanId,
		initiatorId: humanId,
		participants: JSON.stringify([humanId, assistantId]),
		lastActiveAt: now,
		createdAt: now,
	});
	return { humanId, assistantId, threadId };
}

async function seedRoutineAuthority(
	db: HyperIdleDb,
	ids: ScopedIds,
): Promise<ReturnType<typeof seedExplicitSessionAuthority> extends Promise<infer R> ? R : never> {
	const scope = await seedExplicitSessionAuthority(db, ids);
	const now = new Date().toISOString();
	await db.insert(routines).values({
		id: ids("au9-production-routine"),
		name: "Production command",
		teamId: scope.teamId,
		ownerAgentId: scope.agentId,
		triggerType: "cron",
		triggerConfig: "0 * * * *",
		state: "active",
		active: true,
		nextRunAt: new Date(Date.now() - 60_000).toISOString(),
		createdAt: now,
	});
	return scope;
}

describe("atomic production handoffs", () => {
	beforeEach(() => vi.stubEnv("HYPERIDLE_API_KEY", "test-api-key"));
	afterEach(() => vi.unstubAllEnvs());

	test("schema exposes authoritative sources for all seven atomic commands", async ({ db }) => {
		const result = await db.execute(sql`
			select table_name as "tableName" from information_schema.tables
			where table_schema = 'public'
			and table_name in ('messages','explicit_session_starts','knowledge_items','routine_runs','bets','task_dispatch_attempts','proposed_calls','agent_work_intents')
		`);
		const rows = result as { rows: Array<{ tableName: string }> };
		expect(new Set(rows.rows.map((row) => row.tableName))).toEqual(
			new Set([
				"messages",
				"explicit_session_starts",
				"knowledge_items",
				"routine_runs",
				"bets",
				"task_dispatch_attempts",
				"proposed_calls",
				"agent_work_intents",
			]),
		);
	});

	test("composition module exports dependencies only", async () => {
		const worker = await import("../__testing__/durable-agent-queue-test-deps.js");
		expect(worker.queueDeps).toBeTypeOf("function");
		expect("drainIntents" in worker).toBe(false);
		// @lore AU9 R1: handOffIntent was a zero-production-caller duplicate of the
		// drain's own inline resolve+create+checkpoint transaction — deleted rather
		// than kept as a second, un-wired "correct" path (the exact divergence class
		// R1 exists to prevent). No AgentWorkIntentWorkerOptions.onRequest callback
		// exists either — the drain is the sole request-creating path.
		expect("handOffIntent" in worker).toBe(false);
	});

	test("explicit session command commits one source and intent before any request and replays exactly", async ({
		db,
		app,
		ids,
	}) => {
		const scope = await seedExplicitSessionAuthority(db, ids);
		const idemKey = ids("au9-production-explicit");
		const request = () =>
			app.request("/api/sessions", {
				method: "POST",
				headers: { ...authHeaders, "Idempotency-Key": idemKey },
				body: JSON.stringify({
					agentId: scope.agentId,
					taskId: scope.taskId,
					modelTier: "workhorse",
				}),
			});

		const first = await request();
		expect(first.status).toBe(202);
		const firstBody = (await first.json()) as { startId: string; status: string };
		expect(firstBody.status).toBe("requested");
		const startsAfterFirst = await db
			.select()
			.from(explicitSessionStarts)
			.where(eq(explicitSessionStarts.idempotencyKey, idemKey));
		expect(startsAfterFirst).toHaveLength(1);
		const [intent] = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.sourceId, firstBody.startId));
		expect(intent).toMatchObject({
			kind: "session_start",
			sourceKind: "explicit_session_start",
			status: "pending",
			requestId: null,
		});
		const requestsAfterFirst = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.idempotencyKey, idemKey));
		expect(requestsAfterFirst).toHaveLength(0);

		const replay = await request();
		expect(replay.status).toBe(202);
		expect(await replay.json()).toEqual(firstBody);
		const startsAfterReplay = await db
			.select()
			.from(explicitSessionStarts)
			.where(eq(explicitSessionStarts.idempotencyKey, idemKey));
		expect(startsAfterReplay).toHaveLength(1);
		const intentsAfterReplay = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.sourceId, firstBody.startId));
		expect(intentsAfterReplay).toHaveLength(1);
		const requestsAfterReplay = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.idempotencyKey, idemKey));
		expect(requestsAfterReplay).toHaveLength(0);
	});

	test("intent drain checkpoints one exact request and never invokes a domain callback", async ({
		db,
		app,
		ids,
	}) => {
		const scope = await seedExplicitSessionAuthority(db, ids);
		const idemKey = ids("au9-single-consume");
		const response = await app.request("/api/sessions", {
			method: "POST",
			headers: { ...authHeaders, "Idempotency-Key": idemKey },
			body: JSON.stringify({
				agentId: scope.agentId,
				taskId: scope.taskId,
				modelTier: "workhorse",
			}),
		});
		expect(response.status).toBe(202);
		let callbacks = 0;
		await drainIntents(queueDeps(db), {
			now: () => new Date(Date.now() + 1_000),
			...({
				onRequest: async () => {
					callbacks += 1;
				},
			} as object),
		});
		await drainIntents(queueDeps(db), { now: () => new Date(Date.now() + 2_000) });
		// @lore AU38: the intent's idempotencyKey is `explicit-session-start:${startId}`,
		// not the route's idempotency key — find the start first, then query the intent.
		const [start] = await db
			.select()
			.from(explicitSessionStarts)
			.where(eq(explicitSessionStarts.idempotencyKey, idemKey));
		const intents = start
			? await db
					.select()
					.from(agentWorkIntents)
					.where(eq(agentWorkIntents.idempotencyKey, `explicit-session-start:${start.id}`))
			: [];
		const intent = intents[0];
		// @lore AU38: the baked session_start request carries sourceKind:"task" and
		// sourceId:task.id (not the explicit_session_start id) — the drain creates
		// the request from the baked payload, so we query by the task identity.
		const requests = start
			? await db
					.select()
					.from(agentSessionRequests)
					.where(
						and(
							eq(agentSessionRequests.sourceKind, "task"),
							eq(agentSessionRequests.sourceId, scope.taskId),
						),
					)
			: [];
		expect(callbacks, JSON.stringify(intent)).toBe(0);
		expect(requests, JSON.stringify(intent)).toHaveLength(1);
		expect(intent).toMatchObject({ status: "handed_off", requestId: requests[0]?.id });
	});

	test("task route acceptance atomically records its dispatch occasion before returning", async ({
		db,
		app,
		ids,
	}) => {
		const scope = await seedExplicitSessionAuthority(db, ids);
		await db
			.update(tasks)
			.set({ state: "proposed", ownerAgentId: scope.agentId })
			.where(eq(tasks.id, scope.taskId));

		const response = await app.request(`/api/tasks/${scope.taskId}/transition`, {
			method: "POST",
			headers: authHeaders,
			body: JSON.stringify({ state: "accepted" }),
		});

		expect(response.status).toBe(200);
		const attempts = await db
			.select()
			.from(taskDispatchAttempts)
			.where(eq(taskDispatchAttempts.taskId, scope.taskId));
		const intents = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.sourceId, attempts[0]?.id ?? ""));
		expect(intents).toHaveLength(1);
		expect(intents[0]).toMatchObject({
			kind: "task_run",
			sourceKind: "task_dispatch_attempt",
			status: "pending",
			requestId: null,
		});
		const requests = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.sourceId, attempts[0]?.id ?? ""));
		expect(requests).toHaveLength(0);
	});

	test("accepted-task event observes exactly one durable attempt and one intent", async ({
		db,
		app,
		eventBus,
		ids,
	}) => {
		const scope = await seedExplicitSessionAuthority(db, ids);
		await db
			.update(tasks)
			.set({ state: "proposed", ownerAgentId: scope.agentId })
			.where(eq(tasks.id, scope.taskId));
		let observed: Promise<readonly [number, number]> | undefined;
		const unsubscribe = eventBus.on("task_state_changed", (event) => {
			if (event.taskId !== scope.taskId || event.toState !== "accepted") return;
			observed = Promise.all([
				db
					.select()
					.from(taskDispatchAttempts)
					.where(eq(taskDispatchAttempts.taskId, event.taskId))
					.then((rows) => rows.length),
				db
					.select()
					.from(agentWorkIntents)
					.where(eq(agentWorkIntents.sourceKind, "task_dispatch_attempt"))
					.then((rows) => rows.length),
			]);
		});

		const response = await app.request(`/api/tasks/${scope.taskId}/transition`, {
			method: "POST",
			headers: authHeaders,
			body: JSON.stringify({ state: "accepted" }),
		});
		unsubscribe();

		expect(response.status).toBe(200);
		expect(observed).toBeDefined();
		expect(await observed).toEqual([1, 1]);
	});

	test("dependency watcher acceptance records a distinct dispatch occasion", async ({
		db,
		eventBus,
		ids,
	}) => {
		const scope = await seedExplicitSessionAuthority(db, ids);
		const now = new Date().toISOString();
		const dependentId = ids("au9-production-dependent");
		await db.insert(tasks).values({
			id: dependentId,
			betId: scope.betId,
			teamId: scope.teamId,
			ownerAgentId: scope.agentId,
			title: "Unblocked work",
			state: "hold",
			dependencies: JSON.stringify([scope.taskId]),
			createdAt: now,
			updatedAt: now,
		});
		await db.update(tasks).set({ state: "done" }).where(eq(tasks.id, scope.taskId));

		await checkAndUnblockDependents(db, eventBus, scope.taskId, depWatcherDeps);

		const [dependent] = await db.select().from(tasks).where(eq(tasks.id, dependentId));
		expect(dependent?.state).toBe("accepted");
		const attempts = await db
			.select()
			.from(taskDispatchAttempts)
			.where(eq(taskDispatchAttempts.taskId, dependentId));
		const intents = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.sourceId, attempts[0]?.id ?? ""));
		expect(intents).toHaveLength(1);
		expect(attempts[0]?.occasion).toBe("accepted");
	});

	// AU31 §3.1 site 5 — INVERTED. The message insert is no longer inside the
	// same transaction as the intent submit (relinquished, founder ruling
	// architecture.md §3.1/§13 item 9): a seam call from inside this route's
	// own open `db.transaction()` reproduced a real deadlock (§3.2), so the
	// two writes can no longer share one transaction. This test used to prove
	// they rolled back together; it now proves the named window — a committed
	// message with no queued turn intent, repaired by a re-send (the
	// coherence trigger re-bakes on the next thread append anyway).
	test("real assistant message command: the message survives even when the intent write fails (AU31 §3.1 site 5)", async ({
		db,
		app,
		ids,
	}) => {
		const { humanId, threadId } = await seedAssistantThread(db, ids);
		await rejectIntentWrites(db);

		const clientKey = ids("au9-assistant-command");
		const response = await app.request(`/api/threads/${threadId}/messages`, {
			method: "POST",
			headers: { ...authHeaders, "X-Identity": humanId },
			body: JSON.stringify({
				type: "plain",
				payload: { text: "Run the production assistant command" },
				clientKey: clientKey,
			}),
		});

		// The seam's intent submit fails (uncaught) — the route still 500s —
		// but the message insert already committed before that call ran.
		expect(response.status).toBe(500);
		const myMessages = await db.select().from(messages).where(eq(messages.clientKey, clientKey));
		expect(myMessages).toHaveLength(1);
		const intentsAfter = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.sourceKind, "thread_message"));
		expect(intentsAfter).toHaveLength(0);
	});

	// AU31 §3.1 site 4 — INVERTED. The flag transition is no longer inside the
	// same transaction as the intent submit (relinquished, founder ruling
	// architecture.md §3.1/§13 item 9): the flag commits regardless of
	// whether the seam's intent submit later fails. This test used to prove
	// the two writes rolled back together; it now proves the named window —
	// a flagged item with no queued review action, repaired by a retry that
	// re-runs the idempotent flag path and re-submits under the same key.
	test("real knowledge flag command: the flag survives even when the intent write fails (AU31 §3.1 site 4)", async ({
		db,
		app,
		ids,
	}) => {
		const knowledgeAgentId = ids("au9-knowledge-agent");
		await db.insert(users).values({
			id: knowledgeAgentId,
			kind: "ai",
			name: "Knowledge reviewer",
			role: "builder",
			status: "active",
			createdAt: new Date().toISOString(),
		});
		const created = await app.request("/api/knowledge", {
			method: "POST",
			headers: authHeaders,
			body: JSON.stringify({
				topic: ids("au9"),
				title: "Atomic knowledge action",
				body: "Must survive only with its intent",
				format: "markdown",
				scopeKind: "factory",
				updatedBy: ids("au9-human"),
			}),
		});
		const item = (await created.json()) as { id: string; status: string };
		// @lore AU14: POST /api/knowledge now routes through the shared repository's
		// create(), which unconditionally writes a `create` knowledgeEditLog row (AC-4
		// convergence — see plans/AU14/architecture.md §7/§9 D1). Capture the baseline
		// count here (1 durable row from the create above) so the assertion below
		// proves the flag transaction added exactly one new row.
		const editLogCountBeforeFlag = (
			await db.select().from(knowledgeEditLog).where(eq(knowledgeEditLog.itemId, item.id))
		).length;
		await rejectIntentWrites(db);

		const response = await app.request(`/api/knowledge/${item.id}/flag`, {
			method: "POST",
			headers: authHeaders,
			body: JSON.stringify({ reason: "needs agent review", agentId: knowledgeAgentId }),
		});

		// The seam's intent submit fails (uncaught) — the route still 500s —
		// but the flag transition already committed before that call ran.
		expect(response.status).toBe(500);
		const [persisted] = await db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, item.id));
		expect(persisted?.status).toBe("draft");
		const editLogAfterFlag = await db
			.select()
			.from(knowledgeEditLog)
			.where(eq(knowledgeEditLog.itemId, item.id));
		expect(editLogAfterFlag).toHaveLength(editLogCountBeforeFlag + 1);
		const intentsAfter = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.sourceKind, "knowledge_flag"));
		expect(intentsAfter).toHaveLength(0);
	});

	// AU31 §3.1 site 8 — INVERTED. The routine_run row commits (outcome
	// "running") in its own transaction before the seam's intent submit runs;
	// on a failed submit, the founder-ruled error handling marks the SAME
	// row `outcome:"error"` (guarded `onlyIfRunning`) rather than leaving it
	// wedged as permanently "running" — see `routine-scheduler.ts`'s
	// `fireGenericRoutine`.
	test("real manual routine command: the run is marked error, not rolled back, when the intent write fails (AU31 §3.1 site 8)", async ({
		db,
		app,
		ids,
	}) => {
		await seedRoutineAuthority(db, ids);
		await rejectIntentWrites(db);

		const response = await app.request(`/api/routines/${ids("au9-production-routine")}/trigger`, {
			method: "POST",
			headers: authHeaders,
		});

		expect(response.status).toBe(500);
		const runs = await db
			.select()
			.from(routineRuns)
			.where(eq(routineRuns.routineId, ids("au9-production-routine")));
		expect(runs).toHaveLength(1);
		expect(runs[0]?.outcome).toBe("error");
		const intentsAfter = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.sourceKind, "routine_trigger"));
		expect(intentsAfter).toHaveLength(0);
	});

	test("real scheduler routine command: the run is marked error, not rolled back, when the intent write fails (AU31 §3.1 site 8)", async ({
		db,
		eventBus,
		agentOrchestration,
		ids,
	}) => {
		await seedRoutineAuthority(db, ids);
		const [routine] = await db
			.select()
			.from(routines)
			.where(eq(routines.id, ids("au9-production-routine")));
		await rejectIntentWrites(db);

		await expect(
			fireGenericRoutine(db, eventBus, agentOrchestration, routine!, {
				adapterPool: {},
				workspace: {},
				sandboxBasePath: "/tmp/au9-production",
			}),
		).rejects.toThrow();
		const runs = await db
			.select()
			.from(routineRuns)
			.where(eq(routineRuns.routineId, ids("au9-production-routine")));
		expect(runs).toHaveLength(1);
		expect(runs[0]?.outcome).toBe("error");
		const intentsAfter = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.sourceKind, "routine_trigger"));
		expect(intentsAfter).toHaveLength(0);
	});

	async function proveHandoffOccasion(
		db: HyperIdleDb,
		ids: ScopedIds,
		request: (path: string, init: RequestInit) => Response | Promise<Response>,
		target: { toAgent?: string; toRole?: string },
	) {
		const scope = await seedExplicitSessionAuthority(db, ids);
		const now = new Date().toISOString();
		const sourceAgentId = ids("au9-production-source-agent");
		const taskThreadId = ids("au9-production-task-thread");
		const sourceSessionId = ids("au9-production-source-session");
		await db.insert(users).values({
			id: sourceAgentId,
			kind: "ai",
			name: "Source",
			role: "product_manager",
			status: "active",
			teamId: scope.memberId,
			createdAt: now,
		});
		await db.insert(threads).values({
			id: taskThreadId,
			hostKind: "task",
			hostId: scope.taskId,
			initiatorId: sourceAgentId,
			participants: JSON.stringify([sourceAgentId]),
			lastActiveAt: now,
			createdAt: now,
		});
		await db
			.update(tasks)
			.set({
				ownerAgentId: sourceAgentId,
				threadId: taskThreadId,
			})
			.where(eq(tasks.id, scope.taskId));
		await db.insert(sessions).values({
			id: sourceSessionId,
			taskId: scope.taskId,
			agentId: sourceAgentId,
			modelTier: "workhorse",
			startedAt: now,
			state: "active",
		});

		const response = await request(`/api/tasks/${scope.taskId}/handoff`, {
			method: "POST",
			headers: authHeaders,
			body: JSON.stringify({
				sessionId: sourceSessionId,
				...target,
				reason: "Continue with builder",
			}),
		});
		expect(response.status).toBe(200);
		const attempts = await db
			.select()
			.from(taskDispatchAttempts)
			.where(eq(taskDispatchAttempts.taskId, scope.taskId));
		const intents = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.sourceId, attempts[0]?.id ?? ""));
		expect(intents).toHaveLength(1);
		expect(attempts[0]).toMatchObject({
			occasion: "owner_handoff",
			agentId: scope.agentId,
		});
		expect(intents[0]).toMatchObject({
			kind: "task_run",
			sourceKind: "task_dispatch_attempt",
			requestedBy: scope.agentId,
		});
		const requests = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.sourceId, attempts[0]?.id ?? ""));
		expect(requests).toHaveLength(0);
	}

	test("task handoff toAgent records owner-change occasion atomically", async ({
		db,
		app,
		ids,
	}) => {
		await proveHandoffOccasion(db, ids, (path, init) => Promise.resolve(app.request(path, init)), {
			toAgent: ids("au9-production-agent"),
		});
	});

	test("task handoff toRole records owner-change occasion atomically", async ({ db, app, ids }) => {
		await proveHandoffOccasion(db, ids, (path, init) => Promise.resolve(app.request(path, init)), {
			toRole: "builder",
		});
	});

	test("hold to accepted retry records one durable dispatch occasion", async ({ db, app, ids }) => {
		const scope = await seedExplicitSessionAuthority(db, ids);
		await db
			.update(tasks)
			.set({ state: "hold", ownerAgentId: scope.agentId })
			.where(eq(tasks.id, scope.taskId));
		const response = await app.request(`/api/tasks/${scope.taskId}/transition`, {
			method: "POST",
			headers: authHeaders,
			body: JSON.stringify({ state: "accepted" }),
		});
		expect(response.status).toBe(200);
		const attempts = await db
			.select()
			.from(taskDispatchAttempts)
			.where(eq(taskDispatchAttempts.taskId, scope.taskId));
		const intents = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.sourceId, attempts[0]?.id ?? ""));
		expect(intents).toHaveLength(1);
		expect(attempts[0]?.occasion).toBe("retry");
	});

	test("real proposed-call grant command records one replay-safe reengagement occasion", async ({
		db,
		ids,
	}) => {
		await seedProposedCallWorld(db, ids);
		await transitionProposedCall(
			db,
			{
				to: "granted",
				id: ids("au9-production-call"),
				taskScope: ids("au9-production-task"),
				agentScope: ids("au9-production-agent"),
				approvedToolId: ids("commit_file"),
				approvedArgs: { path: "result.txt" },
			},
			{ intentRecorder: { record: enqueueWorkIntent } },
		);
		const intents = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.sourceId, ids("au9-production-call")));
		expect(intents).toHaveLength(1);
		expect(intents[0]).toMatchObject({ kind: "reengagement", status: "pending", requestId: null });
	});
});
