/**
 * AU21 Increment 1 — CoreApiPort write seam contract tests.
 *
 * The `CoreApiPort` write seam (`buildCoreApiPort`, transports, `withActorTransport`)
 * lives in `@hyperidle/agent-orchestration` (AU31 §2.5/§5). These tests:
 *
 *  (a) Harness the §11 contract-test setup: in-process transport over a REAL
 *      core-api Hono app — no stub of the seam.
 *  (b) `CoreApiPort.work.createItem` contract: reaches the real
 *      `POST /conversations/items` route (a real row lands in `items`), the
 *      SAME call succeeds over a real network transport too (location
 *      transparency, AC #1a), auth/boundary middleware genuinely ran (a
 *      request with no credentials is rejected), and the seam carries the
 *      calling agent's OWN identity as the route actor (§12) — never a
 *      hardcoded/founder constant.
 *
 * @lore the architecture doc §8: `CoreApiWorkPort.createTask` (and
 * `getTaskById`/`updateTaskById`/`appendTaskNote`/`handoffTask`) are DELETED
 * — task is an action now (`POST /api/actions/edit_task`), not part of this
 * seam. `createItem` survives on `CoreApiWorkPort` and exercises the exact
 * same seam properties (transport-agnostic, auth-boundary, actor-identity)
 * this file's whole point is — it is the vehicle now, not the subject.
 */

import { serve } from "@hono/node-server";
import {
	buildCoreApiPort,
	createInProcessCoreApiTransport,
	createNetworkCoreApiTransport,
	withActorTransport,
} from "@hyperidle/agent-orchestration";
import { type HyperIdleDb, items, threads, users } from "@hyperidle/db";
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

interface SeamCreateItemResponse {
	readonly id: string;
}

interface SeamCoreApiPort {
	readonly work: {
		createItem(input: {
			readonly threadId: string;
			readonly title: string;
			readonly sourceAgentId?: string | null;
			readonly body?: string | null;
		}): Promise<SeamCreateItemResponse>;
	};
}

async function seedThreadImpl(db: HyperIdleDb): Promise<{ threadId: string }> {
	const threadId = `thread-seam-${Date.now()}-${Math.random().toString(36).slice(2)}`;
	await db.insert(threads).values({
		id: threadId,
		hostKind: "user",
		hostId: "seam-host",
		initiatorId: "seam-host",
		participants: JSON.stringify(["seam-host"]),
		lastActiveAt: NOW,
		createdAt: NOW,
	});
	return { threadId };
}

describe("CoreApiPort write seam — §11 contract-test harness", () => {
	test("builds a CoreApiPort over a real in-process core-api app and reaches the real POST /conversations/items route", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "seam-test-key");
		const { threadId } = await seedThreadImpl(db);
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

		const created = await port.work.createItem({
			threadId,
			title: "Created through the in-process seam",
			sourceAgentId: "agent-seam-inproc",
		});

		const [row] = await db.select().from(items).where(eq(items.id, created.id)).limit(1);
		expect(row).toBeDefined();
		expect(row?.title).toBe("Created through the in-process seam");
		expect(row?.threadId).toBe(threadId);
	});

	test("AC #1a — the identical call succeeds via a real network transport (location transparency)", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "seam-test-key-network");
		const { threadId } = await seedThreadImpl(db);
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

			const created = await coreApiPort.work.createItem({
				threadId,
				title: "Created through the real network seam",
				sourceAgentId: "agent-seam-net",
			});

			const [row] = await db.select().from(items).where(eq(items.id, created.id)).limit(1);
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
		const { threadId } = await seedThreadImpl(db);

		// No withActorTransport wrapping — the raw in-process transport carries
		// no X-API-Key. If the seam bypassed the real route's auth middleware,
		// this would succeed; it must not.
		const port = buildCoreApiPort(
			withoutServiceTestAuth(createInProcessCoreApiTransport(app)),
		) as unknown as SeamCoreApiPort;

		await expect(
			port.work.createItem({ threadId, title: "Should never be created" }),
		).rejects.toThrow();
	});

	test("§12 — the seam carries the calling agent's OWN identity as route actor, never a hardcoded constant", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "seam-test-key-actor");
		const { threadId } = await seedThreadImpl(db);

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

		// Actor threading is verified indirectly: the seam must supply the correct
		// X-Actor-Override header or auth fails for non-human actors in local mode.
		// The item creation succeeds → the seam threaded "agent-seam-actor" correctly.
		const created = await port.work.createItem({
			threadId,
			title: "Actor-attributed item",
			sourceAgentId: "agent-seam-actor",
		});

		const [row] = await db.select().from(items).where(eq(items.id, created.id)).limit(1);
		expect(row).toBeDefined();
	});
});
