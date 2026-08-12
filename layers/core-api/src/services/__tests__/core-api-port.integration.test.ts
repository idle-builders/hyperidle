/**
 * AU21 Increment 1 — RED phase.
 *
 * The `CoreApiPort` write seam does not exist yet (architecture.md §2, §6
 * Decision A/C, §10, §11). These tests specify:
 *
 *  (a) the §11 contract-test harness itself: building a `CoreApiPort` over an
 *      in-process transport (`fetch = app.request`) against a REAL core-api
 *      Hono app instance, and reaching a REAL route — no stub of the seam.
 *  (b) `CoreApiPort.work.createBet`'s contract test: it reaches the real
 *      `POST /bets` route (a real row lands in the `bets` table), the SAME
 *      call succeeds over a real network transport too (location
 *      transparency, AC #1a), auth/boundary middleware genuinely ran (a
 *      request with no credentials is rejected, not silently bypassed by the
 *      in-process path), and the seam carries the calling agent's OWN
 *      identity as the route actor (§12) — never a hardcoded/founder
 *      constant.
 *
 * `buildCoreApiPort`, `createInProcessCoreApiTransport`,
 * `createNetworkCoreApiTransport`, and `withActorTransport` do not exist yet
 * (Increment 1 GREEN phase target: `../core-api-port-composition.js`). Every
 * test below fails at import-resolution time — RED for the right reason
 * (missing implementation, not a typo).
 */

import { serve } from "@hono/node-server";
import {
	buildCoreApiPort,
	createInProcessCoreApiTransport,
	createNetworkCoreApiTransport,
	withActorTransport,
} from "@hyperidle/agent-orchestration";
import { bets, type HyperIdleDb, teamMembers, teams, users } from "@hyperidle/db";
import type { ScopedIds } from "@hyperidle/db/test-fixtures";
import { eq } from "drizzle-orm";
import { describe, expect, test, vi } from "../../__testing__/test-fixtures.js";

const NOW = "2026-07-27T00:00:00.000Z";

interface SeamCreateBetResponse {
	readonly id: string;
	readonly teamId: string;
	readonly status: string;
	readonly revisionLog: string | null;
}

interface SeamCoreApiPort {
	readonly work: {
		createBet(input: {
			readonly teamId: string;
			readonly description: string;
			readonly doneCondition?: string | null;
			readonly hypothesis?: string | null;
		}): Promise<SeamCreateBetResponse>;
	};
}

async function seedTeamImpl(
	db: HyperIdleDb,
	ids: ScopedIds,
	prefix: string,
): Promise<{ teamId: string }> {
	const teamId = ids(`${prefix}-team`);
	const teamMembersId = ids(`${prefix}-tm`);
	await db.insert(teams).values({ id: teamId, name: "Seam Team", phase: "build", createdAt: NOW });
	await db
		.insert(teamMembers)
		.values({ id: teamMembersId, teamId, capacity: 5, activeBets: 0, formedAt: NOW });
	return { teamId };
}

describe("CoreApiPort write seam — §11 contract-test harness", () => {
	test("builds a CoreApiPort over a real in-process core-api app and reaches the real POST /bets route", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("seam-test-key"));
		const { teamId } = await seedTeamImpl(db, ids, "inproc");
		const agentId = ids("agent-seam-inproc");
		await db.insert(users).values({
			id: agentId,
			kind: "ai",
			name: "Seam Agent",
			role: "engineer",
			status: "active",
			createdAt: NOW,
		});

		const transport = withActorTransport(createInProcessCoreApiTransport(app), {
			userId: agentId,
		});
		const port = buildCoreApiPort(transport) as unknown as SeamCoreApiPort;

		const created = await port.work.createBet({
			teamId,
			description: "Created through the in-process seam",
		});

		expect(created.status).toBe("draft");
		expect(created.teamId).toBe(teamId);

		const [row] = await db.select().from(bets).where(eq(bets.id, created.id)).limit(1);
		expect(row).toBeDefined();
		expect(row?.description).toBe("Created through the in-process seam");
		expect(row?.status).toBe("draft");
	});

	test("AC #1a — the identical call succeeds via a real network transport (location transparency)", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("seam-test-key-network"));
		const { teamId } = await seedTeamImpl(db, ids, "net");
		const agentId = ids("agent-seam-net");
		await db.insert(users).values({
			id: agentId,
			kind: "ai",
			name: "Seam Agent Net",
			role: "engineer",
			status: "active",
			createdAt: NOW,
		});

		let resolvePort: (port: number) => void;
		const portPromise = new Promise<number>((resolve) => {
			resolvePort = resolve;
		});
		const server = serve({ fetch: app.fetch, port: 0 }, (info) => {
			resolvePort(info.port);
		});
		const port = await portPromise;

		try {
			const baseUrl = `http://127.0.0.1:${port}/api`;

			const transport = withActorTransport(createNetworkCoreApiTransport(baseUrl), {
				userId: agentId,
			});
			const coreApiPort = buildCoreApiPort(transport) as unknown as SeamCoreApiPort;

			const created = await coreApiPort.work.createBet({
				teamId,
				description: "Created through the real network seam",
			});

			expect(created.teamId).toBe(teamId);

			const [row] = await db.select().from(bets).where(eq(bets.id, created.id)).limit(1);
			expect(row).toBeDefined();
			expect(row?.description).toBe("Created through the real network seam");
		} finally {
			await new Promise<void>((resolve) => server.close(() => resolve()));
		}
	});

	test("auth/boundary middleware genuinely ran — a call with no credentials is rejected, not bypassed", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("seam-test-key-noauth"));
		const { teamId } = await seedTeamImpl(db, ids, "noauth");

		// No withActorTransport wrapping — the raw in-process transport carries
		// no X-API-Key. If the seam bypassed the real route's auth middleware,
		// this would succeed; it must not.
		const port = buildCoreApiPort(
			createInProcessCoreApiTransport(app),
		) as unknown as SeamCoreApiPort;

		await expect(
			port.work.createBet({ teamId, description: "Should never be created" }),
		).rejects.toThrow();
	});

	test("§12 — the seam carries the calling agent's OWN identity as route actor, never a hardcoded constant", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("seam-test-key-actor"));
		const { teamId } = await seedTeamImpl(db, ids, "actor");

		// Seed a human user too — local-mode auth's un-seamed default resolves to
		// the first human. If the seam's actor threading were broken (falling back
		// to that default, or to "u-founder"), this test would catch it.
		const humanId = ids("human-founder-seam");
		const agentId = ids("agent-seam-actor");
		await db.insert(users).values({
			id: humanId,
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(users).values({
			id: agentId,
			kind: "ai",
			name: "Real Calling Agent",
			role: "engineer",
			status: "active",
			createdAt: NOW,
		});

		const transport = withActorTransport(createInProcessCoreApiTransport(app), {
			userId: agentId,
		});
		const port = buildCoreApiPort(transport) as unknown as SeamCoreApiPort;

		const created = await port.work.createBet({ teamId, description: "Actor-attributed bet" });

		expect(created.revisionLog).not.toBeNull();
		const log = JSON.parse(created.revisionLog ?? "[]") as Array<Record<string, unknown>>;
		const creationEntry = log.find((entry) => entry.field === "status");
		expect(creationEntry?.actor).toBe(agentId);
		expect(creationEntry?.actor).not.toBe(humanId);
		expect(creationEntry?.actor).not.toBe("u-founder");
	});
});
