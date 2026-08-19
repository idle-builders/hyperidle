import {
	agentRunConfig,
	agentSessionRequests,
	agentWorkIntents,
	artifacts,
	bets,
	type HyperIdleDb,
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
import { transitionProposedCall } from "@hyperidle/review";
import { enqueueWorkIntent } from "@hyperidle/session-requests";
import { requireRunnableAgent } from "@hyperidle/users";
import { checkAndUnblockDependents } from "@hyperidle/work";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "../__testing__/test-fixtures.js";
import { fireGenericRoutine } from "./dispatch-test-helpers.js";

const authHeaders = {
	"Content-Type": "application/json",
	"X-API-Key": "test-api-key",
};

async function seedExplicitSessionAuthority(db: HyperIdleDb) {
	await db.execute(sql`drop trigger if exists au9_reject_intent_write on agent_work_intents`);
	const now = new Date().toISOString();
	await db
		.insert(teams)
		.values({ id: "au9-production-team", name: "AU9", phase: "build", createdAt: now });
	await db.insert(teamMembers).values({
		id: "au9-production-membership",
		teamId: "au9-production-team",
		capacity: 2,
		activeBets: 0,
		formedAt: now,
	});
	await db.insert(users).values([
		{
			id: "au9-production-human",
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			createdAt: now,
		},
		{
			id: "au9-production-agent",
			kind: "ai",
			name: "Builder",
			role: "builder",
			status: "active",
			teamId: "au9-production-membership",
			createdAt: now,
		},
	]);
	await db.insert(bets).values({
		id: "au9-production-bet",
		teamId: "au9-production-team",
		description: "Atomic handoff",
		appetite: "small",
		status: "active",
		createdAt: now,
	});
	await db.insert(tasks).values({
		id: "au9-production-task",
		betId: "au9-production-bet",
		teamId: "au9-production-team",
		title: "Atomic handoff",
		state: "in_progress",
		createdAt: now,
		updatedAt: now,
	});
}

// @lore shared-pglite-workers: row truncation does not remove a test-created trigger,
// so the helper that installs this fault also owns its exact teardown.
let cleanupRejectedIntentWrites: (() => Promise<void>) | undefined;

async function seedProposedCallWorld(db: HyperIdleDb) {
	await seedExplicitSessionAuthority(db);
	const now = new Date().toISOString();
	await db.insert(artifacts).values({
		id: "au9-production-artifact",
		producingTaskId: "au9-production-task",
		kind: "action_operation",
		createdAt: now,
	});
	await db.insert(threads).values({
		id: "au9-production-thread",
		hostKind: "bet",
		hostId: "au9-production-bet",
		initiatorId: "au9-production-agent",
		participants: JSON.stringify(["au9-production-agent"]),
		lastActiveAt: now,
		createdAt: now,
	});
	await db.insert(messages).values({
		id: "au9-production-review-message",
		senderId: "au9-production-agent",
		threadId: "au9-production-thread",
		type: "review",
		payload: JSON.stringify({ title: "Approve", reasoning: ["needed"] }),
		clientKey: "au9-production-review-message",
		createdAt: now,
	});
	await db.insert(proposedCalls).values({
		id: "au9-production-call",
		reviewMessageId: "au9-production-review-message",
		subjectThreadId: "au9-production-thread",
		artifactId: "au9-production-artifact",
		originSessionId: "au9-production-origin",
		toolId: "commit_file",
		args: JSON.stringify({ path: "result.txt" }),
		identityHash: "au9-production-hash",
		reversibility: "irreversible",
		status: "captured",
		stagedByAgentId: "au9-production-agent",
		createdAt: now,
	});
}

async function rejectIntentWrites(db: HyperIdleDb) {
	await db.execute(sql`drop trigger if exists au9_reject_intent_write on agent_work_intents`);
	cleanupRejectedIntentWrites = async () => {
		await db.execute(sql`drop trigger if exists au9_reject_intent_write on agent_work_intents`);
	};
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

async function seedAssistantThread(db: HyperIdleDb) {
	const now = new Date().toISOString();
	await db.insert(users).values([
		{
			id: "au9-assistant-human",
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			createdAt: now,
		},
		{
			id: "ast-au9-assistant-human",
			kind: "ai",
			name: "Assistant",
			role: "assistant",
			status: "active",
			createdAt: now,
		},
	]);
	// AU26 G1: the run config lives in its own table now.
	await db.insert(agentRunConfig).values({
		agentUserId: "ast-au9-assistant-human",
		harnessType: "builtin",
		modelId: "deepseek/deepseek-v4-flash",
		modelProvider: "openrouter",
	});
	await db.insert(threads).values({
		id: "au9-assistant-thread",
		hostKind: "user",
		hostId: "au9-assistant-human",
		initiatorId: "au9-assistant-human",
		participants: JSON.stringify(["au9-assistant-human", "ast-au9-assistant-human"]),
		lastActiveAt: now,
		createdAt: now,
	});
}

async function seedRoutineAuthority(db: HyperIdleDb) {
	await seedExplicitSessionAuthority(db);
	const now = new Date().toISOString();
	await db.insert(routines).values({
		id: "au9-production-routine",
		name: "Production command",
		teamId: "au9-production-team",
		ownerAgentId: "au9-production-agent",
		triggerType: "cron",
		triggerConfig: "0 * * * *",
		state: "active",
		active: true,
		nextRunAt: new Date(Date.now() - 60_000).toISOString(),
		createdAt: now,
	});
}

describe("atomic production handoffs", () => {
	beforeEach(() => vi.stubEnv("HYPERIDLE_API_KEY", "test-api-key"));
	afterEach(async () => {
		vi.unstubAllEnvs();
		await cleanupRejectedIntentWrites?.();
		cleanupRejectedIntentWrites = undefined;
	});

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

	// POST /api/sessions (door #114) deleted. Two explicit-session tests removed with the route.

	// POST /api/tasks/:id/transition (door #40) deleted. Two transition tests removed with the route.

	test("dependency watcher acceptance records a distinct dispatch occasion", async ({
		db,
		eventBus,
	}) => {
		await seedExplicitSessionAuthority(db);
		const now = new Date().toISOString();
		await db.insert(tasks).values({
			id: "au9-production-dependent",
			betId: "au9-production-bet",
			teamId: "au9-production-team",
			ownerAgentId: "au9-production-agent",
			title: "Unblocked work",
			state: "hold",
			dependencies: JSON.stringify(["au9-production-task"]),
			createdAt: now,
			updatedAt: now,
		});
		await db.update(tasks).set({ state: "done" }).where(eq(tasks.id, "au9-production-task"));

		// AgentWorkIntentRecorderFn is a plain function — capture db in a closure so the
		// intent is written to the real DB (tx was ignored by the sole production impl).
		// @lore AU44: AgentWorkIntentRecorderInput still declares bakedRequest? for back-compat
		// with the proposed-call liveness path; production always provides it.
		// Cast via unknown avoids the contravariance mismatch — safe since
		// checkAndUnblockDependents always bakes before calling the recorder.
		// @lore AU44: AgentWorkIntentRecorderInput still declares bakedRequest? for back-compat.
		// Cast via unknown avoids the contravariance mismatch — safe since production always bakes.
		const workIntentsImpl: import("@hyperidle/work-intent-port").AgentWorkIntentRecorderFn = (
			input,
		) => enqueueWorkIntent(db, input as unknown as Parameters<typeof enqueueWorkIntent>[1]);
		const localDeps = {
			workIntents: workIntentsImpl,
			taskRunResolver: { requireRunnableAgent },
		};
		await checkAndUnblockDependents(db, eventBus, "au9-production-task", localDeps);

		const [dependent] = await db
			.select()
			.from(tasks)
			.where(eq(tasks.id, "au9-production-dependent"));
		expect(dependent?.state).toBe("accepted");
		const attempts = await db
			.select()
			.from(taskDispatchAttempts)
			.where(eq(taskDispatchAttempts.taskId, "au9-production-dependent"));
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
	}) => {
		await seedAssistantThread(db);
		await rejectIntentWrites(db);

		const response = await app.request("/api/threads/au9-assistant-thread/messages", {
			method: "POST",
			headers: { ...authHeaders, "X-Identity": "au9-assistant-human" },
			body: JSON.stringify({
				type: "plain",
				payload: { text: "Run the production assistant command" },
				clientKey: "au9-assistant-command",
			}),
		});

		// The seam's intent submit fails (uncaught) — the route still 500s —
		// but the message insert already committed before that call ran.
		expect(response.status).toBe(500);
		expect(await db.select().from(messages)).toHaveLength(1);
		expect(await db.select().from(agentWorkIntents)).toHaveLength(0);
	});

	// flag (POST /api/knowledge/:id/flag) §3.1 site 4 coverage moved to plugin — ritual routes left core under AU20 founder ruling; recover from git when the plugin lands.

	// AU31 §3.1 site 8 — INVERTED. The routine_run row commits (outcome
	// "running") in its own transaction before the seam's intent submit runs;
	// on a failed submit, the founder-ruled error handling marks the SAME
	// row `outcome:"error"` (guarded `onlyIfRunning`) rather than leaving it
	// wedged as permanently "running" — see `routine-scheduler.ts`'s
	// `fireGenericRoutine`.
	test("real manual routine command: the run is marked error, not rolled back, when the intent write fails (AU31 §3.1 site 8)", async ({
		db,
		app,
	}) => {
		await seedRoutineAuthority(db);
		await rejectIntentWrites(db);

		const response = await app.request("/api/routines/au9-production-routine/trigger", {
			method: "POST",
			headers: authHeaders,
		});

		expect(response.status).toBe(500);
		const runs = await db.select().from(routineRuns);
		expect(runs).toHaveLength(1);
		expect(runs[0]?.outcome).toBe("error");
		expect(await db.select().from(agentWorkIntents)).toHaveLength(0);
	});

	test("real scheduler routine command: the run is marked error, not rolled back, when the intent write fails (AU31 §3.1 site 8)", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedRoutineAuthority(db);
		const [routine] = await db
			.select()
			.from(routines)
			.where(eq(routines.id, "au9-production-routine"));
		await rejectIntentWrites(db);

		await expect(
			fireGenericRoutine(db, eventBus, agentOrchestration, routine!, {
				adapterPool: {},
				workspace: {},
				sandboxBasePath: "/tmp/au9-production",
			}),
		).rejects.toThrow();
		const runs = await db.select().from(routineRuns);
		expect(runs).toHaveLength(1);
		expect(runs[0]?.outcome).toBe("error");
		expect(await db.select().from(agentWorkIntents)).toHaveLength(0);
	});

	async function proveHandoffOccasion(
		db: HyperIdleDb,
		request: (path: string, init: RequestInit) => Response | Promise<Response>,
		target: { toAgent?: string; toRole?: string },
	) {
		await seedExplicitSessionAuthority(db);
		const now = new Date().toISOString();
		await db.insert(users).values({
			id: "au9-production-source-agent",
			kind: "ai",
			name: "Source",
			role: "product_manager",
			status: "active",
			teamId: "au9-production-membership",
			createdAt: now,
		});
		await db.insert(threads).values({
			id: "au9-production-task-thread",
			hostKind: "task",
			hostId: "au9-production-task",
			initiatorId: "au9-production-source-agent",
			participants: JSON.stringify(["au9-production-source-agent"]),
			lastActiveAt: now,
			createdAt: now,
		});
		await db
			.update(tasks)
			.set({
				ownerAgentId: "au9-production-source-agent",
				threadId: "au9-production-task-thread",
			})
			.where(eq(tasks.id, "au9-production-task"));
		await db.insert(sessions).values({
			id: "au9-production-source-session",
			taskId: "au9-production-task",
			agentId: "au9-production-source-agent",
			modelTier: "workhorse",
			startedAt: now,
			state: "active",
		});

		const response = await request("/api/tasks/au9-production-task/handoff", {
			method: "POST",
			headers: authHeaders,
			body: JSON.stringify({
				sessionId: "au9-production-source-session",
				...target,
				reason: "Continue with builder",
			}),
		});
		expect(response.status).toBe(200);
		const attempts = await db
			.select()
			.from(taskDispatchAttempts)
			.where(eq(taskDispatchAttempts.taskId, "au9-production-task"));
		const intents = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.sourceId, attempts[0]?.id ?? ""));
		expect(intents).toHaveLength(1);
		expect(attempts[0]).toMatchObject({
			occasion: "owner_handoff",
			agentId: "au9-production-agent",
		});
		expect(intents[0]).toMatchObject({
			kind: "task_run",
			sourceKind: "task_dispatch_attempt",
			requestedBy: "au9-production-agent",
		});
		expect(await db.select().from(agentSessionRequests)).toHaveLength(0);
	}

	test("task handoff toAgent records owner-change occasion atomically", async ({ db, app }) => {
		await proveHandoffOccasion(db, (path, init) => Promise.resolve(app.request(path, init)), {
			toAgent: "au9-production-agent",
		});
	});

	test("task handoff toRole records owner-change occasion atomically", async ({ db, app }) => {
		await proveHandoffOccasion(db, (path, init) => Promise.resolve(app.request(path, init)), {
			toRole: "builder",
		});
	});

	// POST /api/tasks/:id/transition (door #40) deleted. Retry-transition test removed.

	test("real proposed-call grant command records one replay-safe reengagement occasion", async ({
		db,
	}) => {
		await seedProposedCallWorld(db);
		await transitionProposedCall(
			db,
			{
				to: "granted",
				id: "au9-production-call",
				taskScope: "au9-production-task",
				agentScope: "au9-production-agent",
				approvedToolId: "commit_file",
				approvedArgs: { path: "result.txt" },
			},
			{
				// @lore AU44: same cast pattern as workIntentsImpl above.
				intentRecorder: (
					input: Parameters<import("@hyperidle/work-intent-port").AgentWorkIntentRecorderFn>[0],
				) => enqueueWorkIntent(db, input as unknown as Parameters<typeof enqueueWorkIntent>[1]),
			},
		);
		const intents = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.sourceId, "au9-production-call"));
		expect(intents).toHaveLength(1);
		expect(intents[0]).toMatchObject({ kind: "reengagement", status: "pending", requestId: null });
	});
});
