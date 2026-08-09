/**
 * AU21 §9 Increment 10a (Decision I) RED — the built-in `bet_decomposition`
 * mechanism is REMOVED entirely, not migrated (architecture.md §6 Decision I,
 * §9 Increment 10a). These tests prove the two halves of that increment's
 * ACs:
 *
 *   (a) Committing/activating a bet through the REAL production server
 *       wiring (today: `server-factory.ts`'s `registerBetDecomposition`
 *       subscriber, registered unconditionally in `createServer`) must
 *       record NO `bet_decomposition` work intent, and the resulting bet row
 *       must carry no `decompositionStatus`/`decompositionBlockerReason`
 *       columns at all (the columns are DROPPED, not left null).
 *
 *       Currently RED: `createServer`'s production wiring still calls
 *       `registerBetDecomposition`, so committing an active bet with an
 *       eligible decomposer agent both (i) records a `bet_decomposition`
 *       intent (in the same transaction as its CAS-to-"running" write,
 *       `bet-decomposition.ts`'s `claimAndBakeDecompositionIntent`) and
 *       (ii) writes the still-present `decompositionStatus` column.
 *
 *   (b) The generic explicit-session-start mechanism against a bet's task —
 *       the capability Decision I explicitly PRESERVES (a human/plugin can
 *       still attach an agent to a bet's work via `session_start` /
 *       `explicit_session_start`, `sessions-routes.ts`) — keeps working
 *       unaffected. This test already passes today (nothing in Increment
 *       10a's deletions touches this path); it exists to pin the capability
 *       so the coming deletions can't silently regress it.
 */

import {
	agentWorkIntents,
	bets,
	explicitSessionStarts,
	type HyperIdleDb,
	sessions,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import { createServer, type ServerHandle } from "@hyperidle/remote-server/create-server";
import type { RuntimePorts } from "@hyperidle/run-orchestration";
import { drainIntents } from "@hyperidle/session-requests";
import { eq } from "drizzle-orm";
import { vi } from "vitest";
import { queueDeps } from "../__testing__/durable-agent-queue-test-deps.js";
import { afterEach, beforeEach, describe, expect, test } from "../__testing__/test-fixtures.js";
import { startTestRuntime } from "./run-orchestration-test-runtime.js";

const TEST_API_KEY = "test-key-au21-inc10a";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

async function bootRealServer(db: HyperIdleDb): Promise<{ handle: ServerHandle; baseUrl: string }> {
	const handle = await createServer(0, {
		db,
		topology: "disabled",
		sandboxBasePath: "/tmp/au21-inc10a-workspaces",
	});
	const address = handle.httpServer.address();
	if (!address || typeof address === "string") {
		throw new Error("createServer did not bind a TCP address");
	}
	return { handle, baseUrl: `http://127.0.0.1:${address.port}` };
}

/** Seeds a team with one active AI agent eligible as a bet decomposer (role catalog category "team"). */
async function seedTeamWithEligibleAgent(
	db: HyperIdleDb,
): Promise<{ teamParentId: string; membershipId: string }> {
	const now = new Date().toISOString();
	const teamParentId = "inc10a-team-parent";
	const membershipId = "inc10a-team";
	await db
		.insert(teams)
		.values({ id: teamParentId, name: "Inc10a", phase: "build", createdAt: now });
	await db.insert(teamMembers).values({
		id: membershipId,
		teamId: teamParentId,
		capacity: 3,
		activeBets: 0,
		formedAt: now,
	});
	await db.insert(users).values({
		id: "inc10a-agent",
		kind: "ai",
		name: "Agent",
		role: "builder",
		agentCategory: "team",
		status: "active",
		teamId: membershipId,
		createdAt: now,
	});
	return { teamParentId, membershipId };
}

describe("committing a bet no longer triggers the built-in bet_decomposition mechanism", () => {
	beforeEach(() => vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY));
	afterEach(() => vi.unstubAllEnvs());

	test("committing an active bet with an eligible decomposer agent records no bet_decomposition work intent", async ({
		db,
	}) => {
		const { teamParentId } = await seedTeamWithEligibleAgent(db);
		const { handle, baseUrl } = await bootRealServer(db);
		try {
			const createRes = await fetch(`${baseUrl}/api/bets`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId: teamParentId,
					description: "Build feature X",
				}),
			});
			expect(createRes.status).toBe(201);
			const bet = (await createRes.json()) as { id: string };

			const commitRes = await fetch(`${baseUrl}/api/bets/${bet.id}/commit`, {
				method: "POST",
				headers: authHeaders(),
			});
			expect(commitRes.status).toBe(200);

			// The bet_decomposition subscriber (today still wired in `createServer`)
			// is fire-and-forget off the `bet_state_changed` event the commit route
			// emits; its CAS-to-"running" write and its intent record happen inside
			// ONE transaction (`claimAndBakeDecompositionIntent`). Give it a beat to
			// run, then assert the intent never lands — Decision I removes the only
			// code path that could ever write it.
			await new Promise((resolve) => setTimeout(resolve, 300));
			const decompIntents = await db
				.select()
				.from(agentWorkIntents)
				.where(eq(agentWorkIntents.kind, "bet_decomposition"));
			expect(decompIntents).toHaveLength(0);
		} finally {
			await handle.dispose();
		}
	});

	test("a committed bet's row carries no decompositionStatus/decompositionBlockerReason columns", async ({
		db,
	}) => {
		const { teamParentId } = await seedTeamWithEligibleAgent(db);
		const { handle, baseUrl } = await bootRealServer(db);
		try {
			const createRes = await fetch(`${baseUrl}/api/bets`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					teamId: teamParentId,
					description: "Build feature Y",
				}),
			});
			const bet = (await createRes.json()) as { id: string };
			await fetch(`${baseUrl}/api/bets/${bet.id}/commit`, {
				method: "POST",
				headers: authHeaders(),
			});

			const [betRow] = await db.select().from(bets).where(eq(bets.id, bet.id));
			expect(betRow).toBeDefined();
			// Decision I DROPS these columns entirely (not "sets them null") —
			// they must not exist as keys on the row at all.
			expect(betRow && "decompositionStatus" in betRow).toBe(false);
			expect(betRow && "decompositionBlockerReason" in betRow).toBe(false);
		} finally {
			await handle.dispose();
		}
	});
});

// ---------------------------------------------------------------------------
// (b) The preserved capability: generic explicit-session-start against a
// bet's task still provisions a real agent session, unaffected by Decision
// I's removal. This mirrors `explicit-session-start.production.integration
// .test.ts`'s "admits a requested start to 200 with a real session" — it
// already passes today; it is pinned here as an Increment 10a regression
// guard so the surrounding deletions can't silently break it.
// ---------------------------------------------------------------------------

const sessionProvisioner: NonNullable<RuntimePorts["sessionProvisioner"]> = {
	admitSession: vi.fn(async (deps, params) => {
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
				sandboxPath: "/tmp/au21-inc10a-explicit-start",
				ingestion: { dispose: vi.fn() },
				traceId: "trace-au21-inc10a-explicit-start",
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

describe("the generic explicit-session-start mechanism against a bet's task still provisions an agent session", () => {
	const key = "au21-inc10a-session-key";
	beforeEach(() => vi.stubEnv("HYPERIDLE_API_KEY", key));
	afterEach(() => vi.unstubAllEnvs());

	test("explicit session start against a bet's task still provisions a real agent session", async ({
		db,
		app,
	}) => {
		const now = new Date().toISOString();
		await db
			.insert(teams)
			.values({ id: "inc10a-b-team-parent", name: "Inc10aB", phase: "build", createdAt: now });
		await db.insert(teamMembers).values({
			id: "inc10a-b-team",
			teamId: "inc10a-b-team-parent",
			capacity: 3,
			activeBets: 0,
			formedAt: now,
		});
		await db.insert(users).values([
			{
				id: "inc10a-b-human",
				kind: "human",
				name: "Founder",
				role: "founder",
				status: "active",
				createdAt: now,
			},
			{
				id: "inc10a-b-agent",
				kind: "ai",
				name: "Agent",
				role: "builder",
				status: "idle",
				teamId: "inc10a-b-team",
				createdAt: now,
			},
		]);
		await db.insert(bets).values({
			id: "inc10a-b-bet",
			teamId: "inc10a-b-team-parent",
			description: "Preserved capability bet",
			status: "active",
			createdAt: now,
		});
		const { tasks } = await import("@hyperidle/db");
		await db.insert(tasks).values({
			id: "inc10a-b-task",
			betId: "inc10a-b-bet",
			teamId: "inc10a-b-team-parent",
			title: "Preserved capability task",
			state: "in_progress",
			createdAt: now,
			updatedAt: now,
		});

		const created = await app.request("/api/sessions", {
			method: "POST",
			headers: {
				"X-API-Key": key,
				"Content-Type": "application/json",
				"Idempotency-Key": "inc10a-b",
			},
			body: JSON.stringify({
				agentId: "inc10a-b-agent",
				taskId: "inc10a-b-task",
				modelTier: "workhorse",
			}),
		});
		expect(created.status).toBe(202);
		const { startId } = (await created.json()) as { startId: string };

		await drainIntents(queueDeps(db));
		const eventBus = new (await import("@hyperidle/shared")).EventBus();
		const runtime = await startTestRuntime(db, eventBus, { db, eventBus }, sessionProvisioner);
		await runtime.dispose();

		const poll = await app.request(`/api/sessions/starts/${startId}`, {
			headers: { "X-API-Key": key },
		});
		expect(poll.status).toBe(202);
		const body = (await poll.json()) as { state?: string };
		expect(body.state).toBe("active");
		const [start] = await db
			.select()
			.from(explicitSessionStarts)
			.where(eq(explicitSessionStarts.id, startId));
		expect(start).toMatchObject({ status: "admitted" });
	});
});
