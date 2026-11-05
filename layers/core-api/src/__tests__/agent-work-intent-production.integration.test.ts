import {
	agentRunConfig,
	type HyperIdleDb,
	messages,
	taskDispatchAttempts,
	tasks,
	teams,
	threads,
	users,
	userTeams,
} from "@hyperidle/db";
import { checkAndUnblockDependents } from "@hyperidle/task";
import { listInboxRows } from "@hyperidle/user";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "../__testing__/test-fixtures.js";
import { buildCoreActions } from "../actions/compose.js";

const authHeaders = {
	"Content-Type": "application/json",
	"X-API-Key": "test-api-key",
};

async function seedExplicitSessionAuthority(db: HyperIdleDb) {
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
	await db
		.insert(userTeams)
		.values({ userId: "prodintent-production-agent", teamId: "prodintent-production-team" });
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
	afterEach(() => {
		vi.unstubAllEnvs();
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
		// the architecture doc §5 step 4's occasion table: `hold` -> `accepted`
		// (this dependency-watcher unblock) is the "retry" occasion, distinct
		// from a first-time accept from a non-hold state.
		expect(attempts[0]?.occasion).toBe("retry");
	});

	test("real assistant message command: the message is stored and an inbox row is created for the agent", async ({
		db,
		app,
		asPerson,
	}) => {
		await seedAssistantThread(db);
		await asPerson("prodintent-assistant-human");

		const response = await app.request("/api/actions/send_message", {
			method: "POST",
			headers: authHeaders,
			body: JSON.stringify({
				threadId: "prodintent-assistant-thread",
				text: "Run the production assistant command",
				clientKey: "prodintent-assistant-command",
			}),
		});

		expect(response.status).toBe(200);
		const body = (await response.json()) as { ok: boolean };
		expect(body.ok).toBe(true);
		expect(await db.select().from(messages)).toHaveLength(1);
		// The inbox-based wake: an inbox row is created for the agent.
		const inboxRows = await listInboxRows(db, { userId: "ast-prodintent-assistant-human" });
		expect(inboxRows.filter((r) => r.reason === "message")).toHaveLength(1);
	});
});
