import {
	agentRunConfig,
	agentWorkIntents,
	type HyperIdleDb,
	messages,
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

const authHeaders = {
	"Content-Type": "application/json",
	"X-API-Key": "test-api-key",
};

async function seedExplicitSessionAuthority(db: HyperIdleDb) {
	await db.execute(sql`drop trigger if exists au9_reject_intent_write on agent_work_intents`);
	const now = new Date().toISOString();
	await db
		.insert(teams)
		.values({ id: "prodintent-production-team", name: "Production Intent Team", createdAt: now });
	await db.insert(users).values([
		{
			id: "prodintent-production-human",
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			createdAt: now,
		},
		{
			id: "prodintent-production-agent",
			kind: "ai",
			name: "Builder",
			role: "builder",
			status: "active",
			teamId: "prodintent-production-team",
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
		id: `thr-${"prodintent-production-bet"}`,
		hostKind: "team",
		hostId: "prodintent-production-team",
		initiatorId: "system:propagation",
		participants: "[]",
		lastActiveAt: now,
		createdAt: now,
	});
	await db.insert(tasks).values({
		threadId: `thr-${"prodintent-production-bet"}`,
		id: "prodintent-production-bet",
		parentTaskId: null,
		teamId: "prodintent-production-team",
		title: "Atomic handoff",
		description: "Atomic handoff",
		state: "in_progress",
		createdAt: now,
		updatedAt: now,
	});
	await db.insert(threads).values({
		id: `thr-${"prodintent-production-task"}`,
		hostKind: "team",
		hostId: "prodintent-production-team",
		initiatorId: "system:propagation",
		participants: "[]",
		lastActiveAt: now,
		createdAt: now,
	});
	await db.insert(tasks).values({
		threadId: `thr-${"prodintent-production-task"}`,
		id: "prodintent-production-task",
		parentTaskId: "prodintent-production-bet",
		teamId: "prodintent-production-team",
		title: "Atomic handoff",
		state: "in_progress",
		createdAt: now,
		updatedAt: now,
	});
}

// @lore row truncation does not remove a test-created trigger — the helper that installs a fault also owns its teardown.
let cleanupRejectedIntentWrites: (() => Promise<void>) | undefined;

async function rejectIntentWrites(db: HyperIdleDb) {
	await db.execute(sql`drop trigger if exists au9_reject_intent_write on agent_work_intents`);
	cleanupRejectedIntentWrites = async () => {
		await db.execute(sql`drop trigger if exists au9_reject_intent_write on agent_work_intents`);
	};
	await db.execute(sql`
		create or replace function au9_reject_intent_write() returns trigger as $$
		begin raise exception 'injected intent write failure'; end;
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
			id: "prodintent-assistant-human",
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			createdAt: now,
		},
		{
			id: "ast-prodintent-assistant-human",
			kind: "ai",
			name: "Assistant",
			role: "assistant",
			status: "active",
			createdAt: now,
		},
	]);
	// The run config lives in its own table (agent_run_config).
	await db.insert(agentRunConfig).values({
		agentUserId: "ast-prodintent-assistant-human",
		harnessType: "opencode",
		modelId: "deepseek/deepseek-v4-flash",
		modelProvider: "openrouter",
	});
	await db.insert(threads).values({
		id: "prodintent-assistant-thread",
		hostKind: "user",
		hostId: "prodintent-assistant-human",
		initiatorId: "prodintent-assistant-human",
		participants: JSON.stringify(["prodintent-assistant-human", "ast-prodintent-assistant-human"]),
		lastActiveAt: now,
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

	test("dependency watcher acceptance records a distinct dispatch occasion", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedExplicitSessionAuthority(db);
		const now = new Date().toISOString();
		await db.insert(threads).values({
			id: `thr-${"prodintent-production-dependent"}`,
			hostKind: "team",
			hostId: "prodintent-production-team",
			initiatorId: "system:propagation",
			participants: "[]",
			lastActiveAt: now,
			createdAt: now,
		});
		await db.insert(tasks).values({
			threadId: `thr-${"prodintent-production-dependent"}`,
			id: "prodintent-production-dependent",
			parentTaskId: "prodintent-production-bet",
			teamId: "prodintent-production-team",
			ownerAgentId: "prodintent-production-agent",
			title: "Unblocked work",
			state: "hold",
			dependencies: JSON.stringify(["prodintent-production-task"]),
			createdAt: now,
			updatedAt: now,
		});
		await db.update(tasks).set({ state: "done" }).where(eq(tasks.id, "prodintent-production-task"));

		// §6 row 2: `checkAndUnblockDependents` writes through the real
		// composed `edit_task` action now — this proves the whole chain against
		// the real seam, not a hand-rolled `workIntents` closure.
		const editTaskAction = buildCoreActions({
			agentOrchestration,
			agentWorkIntentRecorder: async () => ({ id: "noop", idempotencyKey: "noop" }),
			reviewVerdictRecorder: async () => ({ status: "not_a_review_session" }),
		}).find((a) => a.declaration.name === "edit_task");
		if (!editTaskAction) throw new Error("edit_task action not found");
		await checkAndUnblockDependents(
			{ actor: "system:propagation", db, eventBus, now: new Date().toISOString() },
			"prodintent-production-task",
			editTaskAction.run as Parameters<typeof checkAndUnblockDependents>[2],
		);

		const [dependent] = await db
			.select()
			.from(tasks)
			.where(eq(tasks.id, "prodintent-production-dependent"));
		expect(dependent?.state).toBe("accepted");
		const attempts = await db
			.select()
			.from(taskDispatchAttempts)
			.where(eq(taskDispatchAttempts.taskId, "prodintent-production-dependent"));
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

	// @lore `send_message`'s wake loop catches each agent's intent-record failure per-agent — the action itself still reports success.
	test("real assistant message command: the message survives even when the intent write fails", async ({
		db,
		app,
	}) => {
		await seedAssistantThread(db);
		await rejectIntentWrites(db);

		const response = await app.request("/api/actions/send_message", {
			method: "POST",
			headers: authHeaders,
			body: JSON.stringify({
				threadId: "prodintent-assistant-thread",
				text: "Run the production assistant command",
				clientKey: "prodintent-assistant-command",
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
});
