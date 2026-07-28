/**
 * AU21 Increment 3, session_start + task_run wave (RED) — architecture.md §6
 * Decision B / §9 Increment 3: the REAL emit call site
 * (`routes/sessions-routes.ts:392`'s `agentWorkIntentRecorder.record(...)`
 * inside the durable explicit-start branch of `POST /api/sessions`) must
 * resolve + validate the session_start run AT EMIT TIME and bake the full
 * request onto the `agent_work_intents` row, instead of enqueuing a bare
 * identity-only intent for the drain to resolve later.
 *
 * Currently RED on two counts, both proven below:
 *   1. The emitted intent's `bakedRequestJson` is null today (the route does
 *      not yet call the new `work` resolver before recording).
 *   2. Because nothing is baked, the drain still falls through to
 *      `resolveIntentInputInternal`'s "session_start" case at DRAIN time,
 *      which reads `deps.work.getTaskById`/`deps.users.getUserById` — a
 *      domain read this migration must delete. Proven by wiring those deps to
 *      throw and asserting the real emitted intent still hands off (it must
 *      not, today).
 */

import {
	agentWorkIntents,
	bets,
	type HyperIdleDb,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import { drainIntents } from "@hyperidle/session-requests";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { queueDeps } from "../../services/durable-agent-queue.js";
import { test } from "../../test-fixtures.js";

const TEST_API_KEY = "test-key-au21-session-start-emit";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

async function seedTaskWorld(
	db: HyperIdleDb,
	options: {
		readonly teamId: string;
		readonly betId: string;
		readonly taskId: string;
		readonly agentId: string;
	},
): Promise<void> {
	const now = new Date().toISOString();
	await db
		.insert(teams)
		.values({ id: options.teamId, name: options.teamId, phase: "build", createdAt: now });
	await db.insert(teamMembers).values({
		id: `${options.teamId}-members`,
		teamId: options.teamId,
		capacity: 5,
		activeBets: 0,
		formedAt: now,
	});
	await db.insert(users).values([
		{
			id: `${options.agentId}-founder`,
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			createdAt: now,
		},
		{
			id: options.agentId,
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "active",
			createdAt: now,
		},
	]);
	await db.insert(bets).values({
		id: options.betId,
		teamId: options.teamId,
		description: "Session-start baked-emit bet",
		status: "active",
		createdAt: now,
	});
	await db.insert(tasks).values({
		id: options.taskId,
		betId: options.betId,
		teamId: options.teamId,
		ownerAgentId: options.agentId,
		title: "Session-start baked-emit task",
		state: "accepted",
		createdAt: now,
		updatedAt: now,
	});
}

describe("session_start is resolved and baked at emit time (POST /api/sessions)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("an explicit session start bakes the session_start request onto the recorded intent", async ({
		db,
		app,
	}) => {
		await seedTaskWorld(db, {
			teamId: "team-au21-sstart-emit-1",
			betId: "bet-au21-sstart-emit-1",
			taskId: "task-au21-sstart-emit-1",
			agentId: "agent-au21-sstart-emit-1",
		});

		const res = await app.request("/api/sessions", {
			method: "POST",
			headers: { ...authHeaders(), "Idempotency-Key": "au21-sstart-emit-key-1" },
			body: JSON.stringify({
				agentId: "agent-au21-sstart-emit-1",
				taskId: "task-au21-sstart-emit-1",
				modelTier: "workhorse",
			}),
		});
		expect(res.status).toBe(202);
		const body = (await res.json()) as { startId: string };

		const [intent] = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.sourceId, body.startId));
		expect(intent).toBeDefined();
		expect(intent?.kind).toBe("session_start");

		// RED today: `bakedRequestJson` is null — the route does not yet bake
		// the request at emit time.
		expect(intent?.bakedRequestJson).toBeTruthy();
		const baked = intent?.bakedRequestJson
			? (JSON.parse(intent.bakedRequestJson) as Record<string, unknown>)
			: undefined;
		expect(baked).toMatchObject({
			defaultAgentId: "agent-au21-sstart-emit-1",
			sourceKind: "task",
			sourceId: "task-au21-sstart-emit-1",
			streamId: "task:task-au21-sstart-emit-1",
			taskId: "task-au21-sstart-emit-1",
			teamId: "team-au21-sstart-emit-1",
			sourceCorrelation: { taskId: "task-au21-sstart-emit-1", teamId: "team-au21-sstart-emit-1" },
		});
	});

	test("the drain hands off the real emitted session_start intent from its baked payload — ZERO work/users domain reads", async ({
		db,
		app,
		eventBus,
	}) => {
		await seedTaskWorld(db, {
			teamId: "team-au21-sstart-emit-2",
			betId: "bet-au21-sstart-emit-2",
			taskId: "task-au21-sstart-emit-2",
			agentId: "agent-au21-sstart-emit-2",
		});

		const res = await app.request("/api/sessions", {
			method: "POST",
			headers: { ...authHeaders(), "Idempotency-Key": "au21-sstart-emit-key-2" },
			body: JSON.stringify({
				agentId: "agent-au21-sstart-emit-2",
				taskId: "task-au21-sstart-emit-2",
				modelTier: "workhorse",
			}),
		});
		expect(res.status).toBe(202);
		const body = (await res.json()) as { startId: string };

		const base = queueDeps(db);
		const throwingGetTaskById = vi.fn(async () => {
			throw new Error("zero-domain-read violation: work.getTaskById was called");
		});
		const throwingGetUserById = vi.fn(async () => {
			throw new Error("zero-domain-read violation: users.getUserById was called");
		});
		const deps = {
			...base,
			eventBus,
			work: { ...base.work, getTaskById: throwingGetTaskById },
			users: { ...base.users, getUserById: throwingGetUserById },
		};

		await drainIntents(deps);

		// RED today: the route never baked a request, so the drain falls
		// through to the per-kind "session_start" resolution, which calls
		// these domain reads — both throwing spies get invoked, and the
		// intent ends up `failed`, not `handed_off`.
		expect(throwingGetTaskById.mock.calls.length).toBe(0);
		expect(throwingGetUserById.mock.calls.length).toBe(0);

		const [intent] = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.sourceId, body.startId));
		expect(intent?.status).toBe("handed_off");
		expect(intent?.requestId).toBeTruthy();
	});
});
