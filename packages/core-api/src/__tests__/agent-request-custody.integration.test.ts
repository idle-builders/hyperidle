/**
 * AU9 Remediation-2 — R2: this suite drives the real DB/request worker
 * (`drainAgentSessionRequests` / `bootAgentLayer`, both from `agent-layer-boot.ts`
 * — NOT one of the five R2-banned custody modules), with a deterministic fake
 * ONLY at the `ProvisionSessionDeps` harness-execution edge (`admitSession` /
 * `runSession` from `session-provisioning.js`, the same seam used by the
 * already-protected `agent-run-boundary.test.ts`). It never imports a
 * custody/claim/terminal/recovery helper directly to assert its return value.
 */

import {
	agentLifecycleInbox,
	agentSessionRequests,
	bets,
	sessions,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import type { AdapterPool, SandboxAdapter } from "@hyperidle/harness-registry";
import { eq } from "drizzle-orm";
import { afterEach, describe, vi } from "vitest";
import { drainAgentSessionRequests } from "../services/run-orchestration-bindings.js";
import { expect, test } from "../test-fixtures.js";

vi.mock("@hyperidle/session-lifecycle", async (importOriginal) => {
	const original = await importOriginal<typeof import("@hyperidle/session-lifecycle")>();
	return {
		...original,
		admitSession: vi.fn(
			async (
				deps: import("@hyperidle/session-lifecycle").ProvisionSessionDeps,
				params: import("@hyperidle/session-lifecycle").ProvisionSessionParams,
			) => {
				// Reflects whichever session row the REAL reserve-or-adopt path already
				// created/adopted for this request — never fabricates a second one.
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
						sandboxPath: "/tmp/au9-custody",
						ingestion: { dispose: vi.fn() },
						traceId: "trace-au9-custody",
						requestContext: params.requestContext,
					},
				};
			},
		),
		runSession: vi.fn(async () => {
			return {
				sessionId: "unused",
				outcome: "completed",
				totalCostCents: 0,
				taskId: null,
				forceReturnCount: 0,
			};
		}),
	};
});

afterEach(() => {
	vi.clearAllMocks();
});

async function seedTaskRequest(
	db: import("@hyperidle/db").HyperIdleDb,
	id: string,
	options: { claimed?: boolean; expired?: boolean } = {},
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({ id: `${id}-team`, name: id, phase: "build", createdAt: now });
	await db.insert(teamMembers).values({
		id: `${id}-member`,
		teamId: `${id}-team`,
		capacity: 3,
		activeBets: 0,
		formedAt: now,
	});
	await db.insert(users).values({
		id: `${id}-agent`,
		kind: "ai",
		name: "Agent",
		role: "builder",
		status: "active",
		teamId: `${id}-member`,
		createdAt: now,
	});
	await db.insert(bets).values({
		id: `${id}-bet`,
		teamId: `${id}-team`,
		description: id,
		status: "active",
		createdAt: now,
	});
	await db.insert(tasks).values({
		id: `${id}-task`,
		betId: `${id}-bet`,
		teamId: `${id}-team`,
		title: id,
		state: "accepted",
		ownerAgentId: `${id}-agent`,
		createdAt: now,
		updatedAt: now,
	});
	await db.insert(agentSessionRequests).values({
		id,
		sourceKind: "task",
		sourceId: `${id}-task`,
		streamId: `task:${id}-task`,
		taskId: `${id}-task`,
		agentId: `${id}-agent`,
		teamId: `${id}-team`,
		promptMode: "task",
		sourceCorrelationJson: JSON.stringify({ taskId: `${id}-task`, teamId: `${id}-team` }),
		idempotencyKey: id,
		status: options.claimed ? "claimed" : "pending",
		...(options.claimed
			? {
					claimedBy: "prior-worker",
					claimedAt: now,
					claimToken: "prior-token",
					claimExpiresAt: options.expired
						? "2000-01-01T00:00:00.000Z"
						: new Date(Date.now() + 30_000).toISOString(),
				}
			: {}),
		createdAt: now,
		updatedAt: now,
	});
}

describe("request custody drives the real drain and runtime", () => {
	test("two concurrent drains yield exactly one winner for a pending request", async ({ db }) => {
		await seedTaskRequest(db, "pending-race");
		const deps = {
			db,
			runtime: {
				db,
				eventBus: new (await import("@hyperidle/shared")).EventBus(),
				adapterPool: {} as AdapterPool,
				workspace: {} as SandboxAdapter,
			},
			sandboxBasePath: "/tmp/au9-custody",
		};
		const [one, two] = await Promise.all([
			drainAgentSessionRequests(deps),
			drainAgentSessionRequests(deps),
		]);
		expect(one + two).toBe(1);
		expect(await db.select().from(sessions)).toHaveLength(1);
		const [request] = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.id, "pending-race"));
		// detachAfterAdmission's mocked runSession resolves near-instantly, so by
		// the time the drain returns the request has already run its full
		// admission→completion lifecycle through the single terminal writer.
		expect(request?.status).toBe("completed");
	});

	test("an expired claim is reclaimed once and the unique correlated session is adopted", async ({
		db,
	}) => {
		await seedTaskRequest(db, "restart-request", { claimed: true, expired: true });
		const deps = {
			db,
			runtime: {
				db,
				eventBus: new (await import("@hyperidle/shared")).EventBus(),
				adapterPool: {} as AdapterPool,
				workspace: {} as SandboxAdapter,
			},
			sandboxBasePath: "/tmp/au9-custody",
		};
		const [one, two] = await Promise.all([
			drainAgentSessionRequests(deps),
			drainAgentSessionRequests(deps),
		]);
		expect(one + two).toBe(1);
		expect(await db.select().from(sessions)).toHaveLength(1);
	});

	test("process death immediately after a committed session insert is recovered on restart without a second session", async ({
		db,
	}) => {
		// Legacy checkpoint: the session row was committed (a prior crashed attempt's
		// reserve-or-adopt succeeded) but the request never reached "running" —
		// it is still "claimed" with an expired lease.
		await seedTaskRequest(db, "checkpoint-request", { claimed: true, expired: true });
		const now = new Date().toISOString();
		await db.insert(sessions).values({
			id: "checkpoint-session",
			requestId: "checkpoint-request",
			taskId: "checkpoint-request-task",
			agentId: "checkpoint-request-agent",
			modelTier: "fast",
			startedAt: now,
			state: "active",
			sourceKind: "task",
			sourceId: "checkpoint-request-task",
			sourceCorrelationJson: JSON.stringify({
				taskId: "checkpoint-request-task",
				teamId: "checkpoint-request-team",
			}),
		});
		const deps = {
			db,
			runtime: {
				db,
				eventBus: new (await import("@hyperidle/shared")).EventBus(),
				adapterPool: {} as AdapterPool,
				workspace: {} as SandboxAdapter,
			},
			sandboxBasePath: "/tmp/au9-custody",
		};
		await drainAgentSessionRequests(deps);
		const durableSessions = await db
			.select()
			.from(sessions)
			.where(eq(sessions.requestId, "checkpoint-request"));
		expect(durableSessions).toHaveLength(1);
		expect(durableSessions[0]?.id).toBe("checkpoint-session");
		const [request] = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.id, "checkpoint-request"));
		expect(request).toMatchObject({ status: "completed", sessionId: "checkpoint-session" });
	});

	test("a completed run has one CAS-won terminal transition and exactly one lifecycle fact", async ({
		db,
	}) => {
		await seedTaskRequest(db, "terminal-request");
		const deps = {
			db,
			runtime: {
				db,
				eventBus: new (await import("@hyperidle/shared")).EventBus(),
				adapterPool: {} as AdapterPool,
				workspace: {} as SandboxAdapter,
			},
			sandboxBasePath: "/tmp/au9-custody",
		};
		await drainAgentSessionRequests(deps);
		const [request] = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.id, "terminal-request"));
		expect(request?.status).toBe("completed");
		const inbox = await db
			.select()
			.from(agentLifecycleInbox)
			.where(eq(agentLifecycleInbox.requestId, "terminal-request"));
		expect(inbox).toHaveLength(1);
		expect(inbox[0]).toMatchObject({ state: "completed" });
	});
});
