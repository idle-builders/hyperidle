import type { AdapterPool, SandboxAdapter } from "@hyperidle/agent-layer";
import { drainAgentSessionRequests, drainAgentWorkIntents } from "@hyperidle/agent-layer";
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
import { eq } from "drizzle-orm";
import { vi } from "vitest";
import { afterEach, beforeEach, describe, expect, test } from "../test-fixtures.js";

vi.mock("../../../agent-layer/src/services/session-provisioning.js", async (importOriginal) => {
	const original = await importOriginal<typeof import("@hyperidle/agent-layer")>();
	return {
		...original,
		admitSession: vi.fn(
			async (
				deps: import("@hyperidle/agent-layer").ProvisionSessionDeps,
				params: import("@hyperidle/agent-layer").ProvisionSessionParams,
			) => {
				if (params.taskId === "au9-fail-task") {
					const { MissingCredentialError } = await import("@hyperidle/shared");
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
			},
		),
		runSession: vi.fn(async () => ({
			sessionId: "unused",
			outcome: "completed",
			totalCostCents: 0,
			taskId: null,
			forceReturnCount: 0,
		})),
	};
});

const key = "au9-session-key";
const headers = { "X-API-Key": key, "Content-Type": "application/json" };

async function seed(db: HyperIdleDb) {
	const now = new Date().toISOString();
	await db
		.insert(teams)
		.values({ id: "au9-team-parent", name: "AU9", phase: "build", createdAt: now });
	await db.insert(teamMembers).values({
		id: "au9-team",
		teamId: "au9-team-parent",
		capacity: 3,
		activeBets: 0,
		formedAt: now,
	});
	await db.insert(users).values([
		{
			id: "au9-human",
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			createdAt: now,
		},
		{
			id: "au9-agent",
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "idle",
			teamId: "au9-team",
			createdAt: now,
		},
	]);
	await db.insert(bets).values({
		id: "au9-bet",
		teamId: "au9-team-parent",
		description: "AU9",
		appetite: "small",
		status: "active",
		createdAt: now,
	});
	await db.insert(tasks).values({
		id: "au9-task",
		betId: "au9-bet",
		teamId: "au9-team-parent",
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
	}) => {
		await seed(db);
		const response = await app.request("/api/sessions", {
			method: "POST",
			headers: { ...headers, "Idempotency-Key": "authority" },
			body: JSON.stringify({ agentId: "au9-agent", taskId: "au9-task", modelTier: "workhorse" }),
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
		expect(start?.requestedAgentId).toBe("au9-agent");
		expect(intent).toMatchObject({ requestedBy: "au9-human" });
	});

	test.each([
		["CostCapExceededError", "COST_CAP_EXCEEDED", 422],
		["ConcurrencyLimitError", "CONCURRENCY_LIMIT", 429],
		["MissingCredentialError", "MISSING_CREDENTIAL", 500],
		["NoEligibleHarnessError", "NO_ELIGIBLE_HARNESS", 422],
		["Error", "INTERNAL_ERROR", 500],
	] as const)("persists and projects stable %s admission failure", async (errorName, code, status) => {
		const boot = (await import("@hyperidle/agent-layer")) as Record<string, unknown>;
		const classify = boot.classifyAdmissionFailure;
		expect(classify).toBeTypeOf("function");
		expect(
			(classify as (error: Error) => { code: string; status: number })(
				Object.assign(new Error("private"), { name: errorName }),
			),
		).toEqual(expect.objectContaining({ code, status }));
	});

	test("same idempotency key replays one pending start and one intent", async ({ db, app }) => {
		await seed(db);
		const request = () =>
			app.request("/api/sessions", {
				method: "POST",
				headers: { ...headers, "Idempotency-Key": "same" },
				body: JSON.stringify({ agentId: "au9-agent", taskId: "au9-task", modelTier: "workhorse" }),
			});
		const first = await request();
		const second = await request();
		expect(second.status).toBe(202);
		expect(await second.json()).toMatchObject(await first.json());
		expect(await db.select().from(explicitSessionStarts)).toHaveLength(1);
		expect(await db.select().from(agentWorkIntents)).toHaveLength(1);
	});

	test("same idempotency key with a different payload is rejected without mutation", async ({
		db,
		app,
	}) => {
		await seed(db);
		const request = (tier: string) =>
			app.request("/api/sessions", {
				method: "POST",
				headers: { ...headers, "Idempotency-Key": "mismatch" },
				body: JSON.stringify({ agentId: "au9-agent", taskId: "au9-task", modelTier: tier }),
			});
		expect((await request("workhorse")).status).toBe(202);
		const conflict = await request("fast");
		expect(conflict.status).toBe(409);
		expect(await conflict.json()).toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
		expect(await db.select().from(explicitSessionStarts)).toHaveLength(1);
	});

	test("polling a pending start is stable and does not enqueue again", async ({ db, app }) => {
		await seed(db);
		const created = await app.request("/api/sessions", {
			method: "POST",
			headers: { ...headers, "Idempotency-Key": "poll" },
			body: JSON.stringify({ agentId: "au9-agent", taskId: "au9-task", modelTier: "workhorse" }),
		});
		const { startId } = (await created.json()) as { startId: string };
		const first = await app.request(`/api/sessions/starts/${startId}`, { headers });
		const second = await app.request(`/api/sessions/starts/${startId}`, { headers });
		expect(first.status).toBe(202);
		expect(await second.json()).toEqual(await first.json());
		expect(await db.select().from(agentWorkIntents)).toHaveLength(1);
	});

	test("the boot-wired drain admits a requested start to 200 with a real session", async ({
		db,
		app,
	}) => {
		await seed(db);
		const created = await app.request("/api/sessions", {
			method: "POST",
			headers: { ...headers, "Idempotency-Key": "admit" },
			body: JSON.stringify({ agentId: "au9-agent", taskId: "au9-task", modelTier: "workhorse" }),
		});
		const { startId } = (await created.json()) as { startId: string };
		await drainAgentWorkIntents(db);
		await drainAgentSessionRequests({
			db,
			runtime: {
				db,
				eventBus: new (await import("@hyperidle/shared")).EventBus(),
				adapterPool: {} as AdapterPool,
				workspace: {} as SandboxAdapter,
			},
			sandboxBasePath: "/tmp/au9-explicit-start",
		});
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
	}) => {
		await seed(db);
		await db.insert(tasks).values({
			id: "au9-fail-task",
			betId: "au9-bet",
			teamId: "au9-team-parent",
			title: "AU9 fail",
			state: "in_progress",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		});
		const created = await app.request("/api/sessions", {
			method: "POST",
			headers: { ...headers, "Idempotency-Key": "admission-failure" },
			body: JSON.stringify({
				agentId: "au9-agent",
				taskId: "au9-fail-task",
				modelTier: "workhorse",
			}),
		});
		const { startId } = (await created.json()) as { startId: string };
		await drainAgentWorkIntents(db);
		await drainAgentSessionRequests({
			db,
			runtime: {
				db,
				eventBus: new (await import("@hyperidle/shared")).EventBus(),
				adapterPool: {} as AdapterPool,
				workspace: {} as SandboxAdapter,
			},
			sandboxBasePath: "/tmp/au9-explicit-start",
		});
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
