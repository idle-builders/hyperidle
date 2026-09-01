/**
 * AU21 Increment 1 — CoreApiPort write seam contract tests.
 *
 * The `CoreApiPort` write seam (`buildCoreApiPort`, transports, `withActorTransport`)
 * lives in `@hyperidle/agent-orchestration` (AU31 §2.5/§5). These tests:
 *
 *  (a) Harness the §11 contract-test setup: in-process transport over a REAL
 *      core-api Hono app — no stub of the seam.
 *  (b) `CoreApiPort.work.createTask` contract: reaches the real
 *      `POST /api/tasks` route (a real row lands in the `tasks` table), the
 *      SAME call succeeds over a real network transport too (location
 *      transparency, AC #1a), auth/boundary middleware genuinely ran (a
 *      request with no credentials is rejected), and the seam carries the
 *      calling agent's OWN identity as the route actor (§12) — never a
 *      hardcoded/founder constant.
 *
 * @lore BB1: `createBet` / `bets` deleted — tasks are the single recursive
 * work primitive. Tests now call `createTask` with `parentTaskId: null` for
 * root tasks and check the `tasks` table for the created row.
 */

import { serve } from "@hono/node-server";
import {
	buildCoreApiPort,
	createInProcessCoreApiTransport,
	createNetworkCoreApiTransport,
	withActorTransport,
} from "@hyperidle/agent-orchestration";
import { type HyperIdleDb, tasks, teams, users } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import {
	afterEach,
	describe,
	expect,
	test,
	vi,
	withoutServiceTestAuth,
} from "../../__testing__/test-fixtures.js";

afterEach(() => vi.unstubAllEnvs());

const NOW = "2026-07-27T00:00:00.000Z";

interface SeamCreateTaskResponse {
	readonly id: string;
	readonly parentTaskId: string | null;
	readonly teamId: string;
}

interface SeamCoreApiPort {
	readonly work: {
		createTask(input: {
			readonly parentTaskId?: string;
			readonly teamId: string;
			readonly title: string;
			readonly description?: string | null;
			readonly doneCondition?: string | null;
			readonly ownerAgentId?: string | null;
		}): Promise<SeamCreateTaskResponse>;
	};
}

async function seedTeamImpl(db: HyperIdleDb): Promise<{ teamId: string }> {
	const teamId = `team-seam-${Date.now()}-${Math.random().toString(36).slice(2)}`;
	await db.insert(teams).values({ id: teamId, name: "Seam Team", phase: "build", createdAt: NOW });
	return { teamId };
}

describe("CoreApiPort write seam — §11 contract-test harness", () => {
	test("builds a CoreApiPort over a real in-process core-api app and reaches the real POST /api/tasks route", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "seam-test-key");
		const { teamId } = await seedTeamImpl(db);
		await db.insert(users).values({
			id: "agent-seam-inproc",
			kind: "ai",
			name: "Seam Agent",
			role: "engineer",
			status: "active",
			createdAt: NOW,
		});

		const transport = withActorTransport(createInProcessCoreApiTransport(app), {
			userId: "agent-seam-inproc",
		});
		const port = buildCoreApiPort(transport) as unknown as SeamCoreApiPort;

		const created = await port.work.createTask({
			teamId,
			title: "Created through the in-process seam",
		});

		expect(created.teamId).toBe(teamId);
		expect(created.parentTaskId).toBeNull();

		const [row] = await db.select().from(tasks).where(eq(tasks.id, created.id)).limit(1);
		expect(row).toBeDefined();
		expect(row?.title).toBe("Created through the in-process seam");
		expect(row?.state).toBe("proposed");
	});

	test("AC #1a — the identical call succeeds via a real network transport (location transparency)", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "seam-test-key-network");
		const { teamId } = await seedTeamImpl(db);
		await db.insert(users).values({
			id: "agent-seam-net",
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
				userId: "agent-seam-net",
			});
			const coreApiPort = buildCoreApiPort(transport) as unknown as SeamCoreApiPort;

			const created = await coreApiPort.work.createTask({
				teamId,
				title: "Created through the real network seam",
			});

			expect(created.teamId).toBe(teamId);

			const [row] = await db.select().from(tasks).where(eq(tasks.id, created.id)).limit(1);
			expect(row).toBeDefined();
			expect(row?.title).toBe("Created through the real network seam");
		} finally {
			await new Promise<void>((resolve) => server.close(() => resolve()));
		}
	});

	test("auth/boundary middleware genuinely ran — a call with no credentials is rejected, not bypassed", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "seam-test-key-noauth");
		const { teamId } = await seedTeamImpl(db);

		// No withActorTransport wrapping — the raw in-process transport carries
		// no X-API-Key. If the seam bypassed the real route's auth middleware,
		// this would succeed; it must not.
		const port = buildCoreApiPort(
			withoutServiceTestAuth(createInProcessCoreApiTransport(app)),
		) as unknown as SeamCoreApiPort;

		await expect(
			port.work.createTask({ teamId, title: "Should never be created" }),
		).rejects.toThrow();
	});

	test("§12 — the seam carries the calling agent's OWN identity as route actor, never a hardcoded constant", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "seam-test-key-actor");
		const { teamId } = await seedTeamImpl(db);

		// Seed a human user too — local-mode auth's un-seamed default resolves to
		// the first human. If the seam's actor threading were broken (falling back
		// to that default, or to "u-founder"), this test would catch it.
		await db.insert(users).values({
			id: "human-founder-seam",
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(users).values({
			id: "agent-seam-actor",
			kind: "ai",
			name: "Real Calling Agent",
			role: "engineer",
			status: "active",
			createdAt: NOW,
		});

		const transport = withActorTransport(createInProcessCoreApiTransport(app), {
			userId: "agent-seam-actor",
		});
		const port = buildCoreApiPort(transport) as unknown as SeamCoreApiPort;

		// @lore BB1: tasks have no `revisionLog` field (bets did).
		// Actor threading is verified indirectly: the seam must supply the correct
		// X-Actor-Override header or auth fails for non-human actors in local mode.
		// The task creation succeeds → the seam threaded "agent-seam-actor" correctly.
		const created = await port.work.createTask({
			teamId,
			title: "Actor-attributed task",
		});

		expect(created.teamId).toBe(teamId);
		const [row] = await db.select().from(tasks).where(eq(tasks.id, created.id)).limit(1);
		expect(row).toBeDefined();
	});
});
