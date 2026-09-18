import {
	agentRunConfig,
	agentWorkIntents,
	type HyperIdleDb,
	messages,
	routineRuns,
	routines,
	taskDispatchAttempts,
	tasks,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { checkAndUnblockDependents } from "@hyperidle/task";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "../__testing__/test-fixtures.js";
import { buildCoreActions } from "../actions/compose.js";
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
			teamId: "au9-production-team",
			createdAt: now,
		},
		// `changes.actor` FKs to `users` — the dependency watcher's edit_task
		// calls below write as "system:propagation".
		{
			id: "system:propagation",
			name: "Propagation System",
			role: "system",
			status: "active",
			createdAt: now,
		},
	]);
	await db.insert(threads).values({
	id: `thr-${"au9-production-bet"}`,
	hostKind: "team",
	hostId: "au9-production-team",
	initiatorId: "system:propagation",
	participants: "[]",
	lastActiveAt: now,
	createdAt: now,
	});
	await db.insert(tasks).values({
	threadId: `thr-${"au9-production-bet"}`,
		id: "au9-production-bet",
		parentTaskId: null,
		teamId: "au9-production-team",
		title: "Atomic handoff",
		description: "Atomic handoff",
		state: "in_progress",
		createdAt: now,
		updatedAt: now,
	});
	await db.insert(threads).values({
	id: `thr-${"au9-production-task"}`,
	hostKind: "team",
	hostId: "au9-production-team",
	initiatorId: "system:propagation",
	participants: "[]",
	lastActiveAt: now,
	createdAt: now,
	});
	await db.insert(tasks).values({
	threadId: `thr-${"au9-production-task"}`,
		id: "au9-production-task",
		parentTaskId: "au9-production-bet",
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
		harnessType: "opencode",
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

	test("schema exposes authoritative sources for all six atomic commands", async ({ db }) => {
		const result = await db.execute(sql`
			select table_name as "tableName" from information_schema.tables
			where table_schema = 'public'
			and table_name in ('messages','explicit_session_starts','knowledge_items','routine_runs','bets','task_dispatch_attempts','agent_work_intents')
		`);
		const rows = result as { rows: Array<{ tableName: string }> };
		expect(new Set(rows.rows.map((row) => row.tableName))).toEqual(
			// BB1: "bets" table deleted — tasks are the single work primitive.
			new Set([
				"messages",
				"explicit_session_starts",
				"knowledge_items",
				"routine_runs",
				"task_dispatch_attempts",
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
		agentOrchestration,
	}) => {
		await seedExplicitSessionAuthority(db);
		const now = new Date().toISOString();
		await db.insert(threads).values({
		id: `thr-${"au9-production-dependent"}`,
		hostKind: "team",
		hostId: "au9-production-team",
		initiatorId: "system:propagation",
		participants: "[]",
		lastActiveAt: now,
		createdAt: now,
		});
		await db.insert(tasks).values({
		threadId: `thr-${"au9-production-dependent"}`,
			id: "au9-production-dependent",
			parentTaskId: "au9-production-bet",
			teamId: "au9-production-team",
			ownerAgentId: "au9-production-agent",
			title: "Unblocked work",
			state: "hold",
			dependencies: JSON.stringify(["au9-production-task"]),
			createdAt: now,
			updatedAt: now,
		});
		await db.update(tasks).set({ state: "done" }).where(eq(tasks.id, "au9-production-task"));

		// §6 row 2: `checkAndUnblockDependents` writes through the real
		// composed `edit_task` action now — this proves the whole chain against
		// the real seam, not a hand-rolled `workIntents` closure.
		const editTaskAction = buildCoreActions({
		agentOrchestration,
		agentWorkIntentRecorder: async () => ({ id: "noop", idempotencyKey: "noop" }),
		reviewVerdictRecorder: async () => ({ status: "not_a_review_session" }),
	}).find(
			(a) => a.declaration.name === "edit_task",
		);
		if (!editTaskAction) throw new Error("edit_task action not found");
		await checkAndUnblockDependents(
			{ actor: "system:propagation", db, eventBus, now: new Date().toISOString() },
			"au9-production-task",
			editTaskAction.run as Parameters<typeof checkAndUnblockDependents>[2],
		);

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
		// the architecture doc §5 step 4's occasion table: `hold` -> `accepted`
		// (this dependency-watcher unblock) is the "retry" occasion, distinct
		// from a first-time accept from a non-hold state.
		expect(attempts[0]?.occasion).toBe("retry");
	});

	// AU31 §3.1 site 5 — INVERTED, then BC3-repointed. The message insert is
	// no longer inside the same transaction as the intent submit
	// (relinquished, founder ruling architecture.md §3.1/§13 item 9): a seam
	// call from inside this route's own open `db.transaction()` reproduced a
	// real deadlock (§3.2), so the two writes can no longer share one
	// transaction. `POST /api/threads/:id/messages` is deleted (BC3); the
	// door is now `POST /api/actions/send_message`, whose wake loop
	// (`thread-actions.ts`) wraps each agent's intent-record call in its own
	// try/catch and drops that one wake on failure rather than letting it
	// escape — so the action itself reports success (200, ok:true) instead
	// of the old route's uncaught 500. This test now proves that same named
	// window through the real contract: a committed message with no queued
	// turn intent, repaired by a re-send (the coherence trigger re-bakes on
	// the next thread append anyway).
	test("real assistant message command: the message survives even when the intent write fails (AU31 §3.1 site 5)", async ({
		db,
		app,
	}) => {
		await seedAssistantThread(db);
		await rejectIntentWrites(db);

		const response = await app.request("/api/actions/send_message", {
			method: "POST",
			headers: authHeaders,
			body: JSON.stringify({
				threadId: "au9-assistant-thread",
				text: "Run the production assistant command",
				clientKey: "au9-assistant-command",
			}),
		});

		// The wake loop's intent-record call fails against the rejecting
		// trigger, but that failure is caught per-agent and dropped — the
		// action still reports ok:true; the message insert already
		// committed inside its own transaction before the wake loop ran.
		expect(response.status).toBe(200);
		const body = (await response.json()) as { ok: boolean };
		expect(body.ok).toBe(true);
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

	// §8 B4: `POST /tasks/:id/handoff` is deleted — handoff is
	// `edit_task({ ownerAgentId })` now, and `toRole`/`toHuman` targeting is
	// gone with it (the caller names a user id). The owner-change dispatch
	// occasion this used to prove atomically is the new seam test's job:
	// `layers/core-api/src/__tests__/task-actions.integration.test.ts`
	// ("an owner change on an in_progress task inserts a second attempt with
	// occasion: owner_handoff and records a second intent").

	// POST /api/tasks/:id/transition (door #40) deleted. Retry-transition test removed.
});
