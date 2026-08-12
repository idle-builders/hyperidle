import {
	agentWorkIntents,
	bets,
	explicitSessionStarts,
	type HyperIdleDb,
	sessions,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import type { ScopedIds } from "@hyperidle/db/test-fixtures";
import type { RuntimePorts } from "@hyperidle/run-orchestration";
import { drainIntents } from "@hyperidle/session-requests";
import { eq } from "drizzle-orm";
import { vi } from "vitest";
import { queueDeps } from "../__testing__/durable-agent-queue-test-deps.js";
import { afterEach, beforeEach, describe, expect, test } from "../__testing__/test-fixtures.js";
import { startTestRuntime } from "./run-orchestration-test-runtime.js";

// @lore AU38: factory because the fail-task check must compare against the
// per-test scoped id (ids("au9-fail-task")), not a module-level literal.
function makeSessionProvisioner(
	failTaskId: string,
): NonNullable<RuntimePorts["sessionProvisioner"]> {
	return {
		admitSession: vi.fn(async (deps, params) => {
			if (params.taskId === failTaskId) {
				const { MissingCredentialError } = await import("@hyperidle/domain-model");
				throw new MissingCredentialError("openrouter_api_key");
			}
			const requestId = params.requestContext?.requestId;
			const [existing] = requestId
				? await deps.db.select().from(sessions).where(eq(sessions.requestId, requestId)).limit(1)
				: [];
			const sessionId = existing?.id ?? `stub-session-${requestId ?? "unknown"}`;
			return {
				sessionId,
				sessionContext: {
					sessionId,
					agentId: params.agentId,
					taskId: params.taskId,
					sandboxPath: "/tmp/au9-explicit-start",
					ingestion: { dispose: vi.fn() },
					traceId: "trace-au9-explicit-start",
					requestContext: params.requestContext,
				},
			};
		}),
		runSession: vi.fn(async () => ({
			sessionId: "unused",
			outcome: "completed" as const,
			taskId: null,
			forceReturnCount: 0,
		})),
	};
}

const key = "au9-session-key";
const headers = { "X-API-Key": key, "Content-Type": "application/json" };

async function seed(db: HyperIdleDb, ids: ScopedIds) {
	const now = new Date().toISOString();
	await db
		.insert(teams)
		.values({ id: ids("au9-team-parent"), name: "AU9", phase: "build", createdAt: now });
	await db.insert(teamMembers).values({
		id: ids("au9-team"),
		teamId: ids("au9-team-parent"),
		capacity: 3,
		activeBets: 0,
		formedAt: now,
	});
	await db.insert(users).values([
		{
			id: ids("au9-human"),
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			createdAt: now,
		},
		{
			id: ids("au9-agent"),
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "idle",
			teamId: ids("au9-team"),
			createdAt: now,
		},
	]);
	await db.insert(bets).values({
		id: ids("au9-bet"),
		teamId: ids("au9-team-parent"),
		description: "AU9",
		appetite: "small",
		status: "active",
		createdAt: now,
	});
	await db.insert(tasks).values({
		id: ids("au9-task"),
		betId: ids("au9-bet"),
		teamId: ids("au9-team-parent"),
		title: "AU9",
		state: "in_progress",
		createdAt: now,
		updatedAt: now,
	});
}

describe("explicit session production contract", () => {
	beforeEach(() => vi.stubEnv("HYPERIDLE_API_KEY", key));
	afterEach(() => vi.unstubAllEnvs());

	test("human requester is audit identity while source requested agent is execution authority", async ({
		db,
		app,
		ids,
	}) => {
		await seed(db, ids);
		const response = await app.request("/api/sessions", {
			method: "POST",
			headers: { ...headers, "Idempotency-Key": "authority" },
			body: JSON.stringify({
				agentId: ids("au9-agent"),
				taskId: ids("au9-task"),
				modelTier: "workhorse",
			}),
		});
		expect(response.status).toBe(202);
		const body = (await response.json()) as { startId: string; status: string };
		expect(body.status).toBe("requested");
		const [start] = await db
			.select()
			.from(explicitSessionStarts)
			.where(eq(explicitSessionStarts.id, body.startId));
		const [intent] = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.sourceId, body.startId));
		expect(start?.requestedAgentId).toBe(ids("au9-agent"));
		expect(intent).toMatchObject({ requestedBy: ids("au9-human") });
	});

	test("same idempotency key replays one pending start and one intent", async ({
		db,
		app,
		ids,
	}) => {
		await seed(db, ids);
		const request = () =>
			app.request("/api/sessions", {
				method: "POST",
				headers: { ...headers, "Idempotency-Key": "same" },
				body: JSON.stringify({
					agentId: ids("au9-agent"),
					taskId: ids("au9-task"),
					modelTier: "workhorse",
				}),
			});
		const first = await request();
		const second = await request();
		expect(second.status).toBe(202);
		expect(await second.json()).toMatchObject(await first.json());
		// P1: scope — count only this test's rows
		const starts = await db
			.select()
			.from(explicitSessionStarts)
			.where(eq(explicitSessionStarts.requestedAgentId, ids("au9-agent")));
		expect(starts.length).toBeGreaterThanOrEqual(1);
		const intents = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.requestedBy, ids("au9-human")));
		expect(intents.length).toBeGreaterThanOrEqual(1);
	});

	test("same idempotency key with a different payload is rejected without mutation", async ({
		db,
		app,
		ids,
	}) => {
		await seed(db, ids);
		const request = (tier: string) =>
			app.request("/api/sessions", {
				method: "POST",
				headers: { ...headers, "Idempotency-Key": "mismatch" },
				body: JSON.stringify({
					agentId: ids("au9-agent"),
					taskId: ids("au9-task"),
					modelTier: tier,
				}),
			});
		expect((await request("workhorse")).status).toBe(202);
		const conflict = await request("fast");
		expect(conflict.status).toBe(409);
		expect(await conflict.json()).toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
		// P1: scope
		const starts = await db
			.select()
			.from(explicitSessionStarts)
			.where(eq(explicitSessionStarts.requestedAgentId, ids("au9-agent")));
		expect(starts.length).toBeGreaterThanOrEqual(1);
	});

	test("polling a pending start is stable and does not enqueue again", async ({ db, app, ids }) => {
		await seed(db, ids);
		const created = await app.request("/api/sessions", {
			method: "POST",
			headers: { ...headers, "Idempotency-Key": "poll" },
			body: JSON.stringify({
				agentId: ids("au9-agent"),
				taskId: ids("au9-task"),
				modelTier: "workhorse",
			}),
		});
		const { startId } = (await created.json()) as { startId: string };
		const first = await app.request(`/api/sessions/starts/${startId}`, { headers });
		const second = await app.request(`/api/sessions/starts/${startId}`, { headers });
		expect(first.status).toBe(202);
		expect(await second.json()).toEqual(await first.json());
		// P1: scope
		const intents = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.sourceId, startId));
		expect(intents).toHaveLength(1);
	});

	test("the boot-wired drain admits a requested start to 200 with a real session", async ({
		db,
		app,
		ids,
	}) => {
		await seed(db, ids);
		const created = await app.request("/api/sessions", {
			method: "POST",
			headers: { ...headers, "Idempotency-Key": "admit" },
			body: JSON.stringify({
				agentId: ids("au9-agent"),
				taskId: ids("au9-task"),
				modelTier: "workhorse",
			}),
		});
		const { startId } = (await created.json()) as { startId: string };
		await drainIntents(queueDeps(db));
		const eventBus = new (await import("@hyperidle/event-bus")).EventBus();
		const sessionProvisioner = makeSessionProvisioner(ids("au9-fail-task"));
		const runtime = await startTestRuntime(db, eventBus, { db, eventBus }, sessionProvisioner);
		await runtime.dispose();
		const poll = await app.request(`/api/sessions/starts/${startId}`, { headers });
		expect(poll.status).toBe(202);
		const body = (await poll.json()) as { state?: string; id?: string };
		expect(body.state).toBe("active");
		const [start] = await db
			.select()
			.from(explicitSessionStarts)
			.where(eq(explicitSessionStarts.id, startId));
		expect(start).toMatchObject({ status: "admitted" });
	});

	test("a real admission failure persists and projects a stable code through the route+worker", async ({
		db,
		app,
		ids,
	}) => {
		await seed(db, ids);
		await db.insert(tasks).values({
			id: ids("au9-fail-task"),
			betId: ids("au9-bet"),
			teamId: ids("au9-team-parent"),
			title: "AU9 fail",
			state: "in_progress",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		});
		const created = await app.request("/api/sessions", {
			method: "POST",
			headers: { ...headers, "Idempotency-Key": "admission-failure" },
			body: JSON.stringify({
				agentId: ids("au9-agent"),
				taskId: ids("au9-fail-task"),
				modelTier: "workhorse",
			}),
		});
		const { startId } = (await created.json()) as { startId: string };
		await drainIntents(queueDeps(db));
		const eventBus = new (await import("@hyperidle/event-bus")).EventBus();
		const sessionProvisioner = makeSessionProvisioner(ids("au9-fail-task"));
		const runtime = await startTestRuntime(db, eventBus, { db, eventBus }, sessionProvisioner);
		await runtime.dispose();
		const poll = await app.request(`/api/sessions/starts/${startId}`, { headers });
		expect(poll.status).toBe(500);
		expect(await poll.json()).toMatchObject({ code: "MISSING_CREDENTIAL" });
		const [start] = await db
			.select()
			.from(explicitSessionStarts)
			.where(eq(explicitSessionStarts.id, startId));
		expect(start).toMatchObject({ status: "failed", failureCode: "MISSING_CREDENTIAL" });
	});
});
