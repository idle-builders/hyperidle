/**
 * AU26 B1a — the two-app mount.
 *
 * `agent-orchestration` gets its own Hono app. Four of `sessions-routes.ts`'s
 * five registrations move onto it (`GET /`, `GET /starts/:startId`,
 * `GET /:id/activity`, `PATCH /:id`); `POST /api/sessions` stays core-hosted
 * (§D-H #16). Both apps mount on the same `/api` router at their unchanged
 * paths (§D-A rule 7), so this file proves the interleaved routing shape the
 * checked-in probe (`.pipeline/work/AU26/probes/two-app-mount/poc4.ts`) predicts:
 *
 *   - every moved route still answers, with the same body, through the
 *     Application-composed instance (AC5(b));
 *   - each of them 401s without auth — the Application's middleware stack
 *     applies to the mounted sub-app (AC5(c));
 *   - `POST /api/sessions`'s body is the whole `sessions` row and
 *     `AgentOrchestrationPort.sessions.getById` returns that same full wire
 *     shape, not a narrowing (AC5(d));
 *   - the two apps do not shadow each other — zero duplicate `method + path`
 *     (AC10);
 *   - an unknown `/api/*` path still gets the canonical JSON 404, not Hono's
 *     `text/plain` default — only the ROOT app's `notFound` fires for a mounted
 *     sub-app (AC9, the feasibility P1 trap).
 *
 * @lore AU26 B1a: `POST /api/sessions`'s two `sessions` touches going through
 * `getById` + `createBareRun` is an ACCEPTED OVER-DELIVERY, not an AU26
 * requirement — the repo-wide `sessions`-ownership programme was cut to AU28
 * mid-increment (§D-A's "accepted as already built" note). If either regresses,
 * the fallback is the direct read/insert, not more port surface.
 */

import { bootAgentOrchestration } from "@hyperidle/agent-orchestration";
import {
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
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";
import { createCoreApiApp } from "../app.js";
import {
	buildAgentOrchestrationPort,
	createInProcessAgentOrchestrationTransport,
} from "../services/agent-orchestration-port-composition.js";

const TEST_API_KEY = "test-key-au26-b1a";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY };
}

const NOW = "2026-08-04T00:00:00.000Z";

async function seed(db: HyperIdleDb): Promise<void> {
	await db.insert(teams).values({ id: "prod-1", name: "P", phase: "build", createdAt: NOW });
	await db
		.insert(teamMembers)
		.values({ id: "team-1", teamId: "prod-1", capacity: 3, activeBets: 0, formedAt: NOW });
	await db.insert(users).values({
		id: "agent-1",
		name: "Builder",
		role: "builder",
		status: "active",
		kind: "ai",
		teamId: "team-1",
		createdAt: NOW,
	});
	await db.insert(users).values({
		id: "human-1",
		name: "Human",
		role: "founder",
		status: "active",
		kind: "human",
		teamId: "team-1",
		createdAt: NOW,
	});
	await db.insert(bets).values({
		id: "bet-1",
		teamId: "prod-1",
		description: "d",
		appetite: "small",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: "task-1",
		betId: "bet-1",
		teamId: "prod-1",
		title: "T",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(sessions).values({
		id: "sess-1",
		agentId: "agent-1",
		taskId: "task-1",
		modelTier: "workhorse",
		state: "active",
		startedAt: NOW,
	});
}

/** Real `method + path` registrations, minus Hono's `ALL` middleware entries. */
function routeKeys(app: {
	readonly routes: ReadonlyArray<{ readonly method: string; readonly path: string }>;
}): ReadonlySet<string> {
	const keys = new Set<string>();
	for (const r of app.routes) {
		if (r.method === "ALL") continue;
		keys.add(`${r.method} ${r.path}`);
	}
	return keys;
}

describe("agent-orchestration's own app, mounted beside core-api's", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	describe("the four relocated session routes answer through the composed app", () => {
		test("GET /api/sessions lists, and filters by task_id", async ({ db, app }) => {
			await seed(db);
			const res = await app.request("/api/sessions?task_id=task-1", { headers: authHeaders() });
			expect(res.status).toBe(200);
			const rows = (await res.json()) as ReadonlyArray<{ id: string }>;
			expect(rows.map((r) => r.id)).toEqual(["sess-1"]);

			const none = await app.request("/api/sessions?task_id=task-nope", { headers: authHeaders() });
			expect(await none.json()).toEqual([]);
		});

		test("GET /api/sessions/starts/:startId projects the caller's own start", async ({
			db,
			app,
		}) => {
			await seed(db);
			await db.insert(explicitSessionStarts).values({
				id: "start-1",
				taskId: "task-1",
				requestedAgentId: "agent-1",
				requestedModelTier: "workhorse",
				requestedBy: "human-1",
				idempotencyKey: "k-1",
				status: "requested",
				createdAt: NOW,
				updatedAt: NOW,
			});

			// A still-`requested` start projects the shared 202 pending body — the same
			// `projectExplicitStartOutcome` core-hosted `POST /api/sessions` renders.
			const res = await app.request("/api/sessions/starts/start-1", { headers: authHeaders() });
			expect(res.status).toBe(202);
			expect(await res.json()).toMatchObject({ startId: "start-1", status: "requested" });
			expect(res.headers.get("Idempotency-Key")).toBe("k-1");

			const missing = await app.request("/api/sessions/starts/nope", { headers: authHeaders() });
			expect(missing.status).toBe(404);
		});

		test("GET /api/sessions/:id/activity returns session metadata + entries", async ({
			db,
			app,
		}) => {
			await seed(db);
			const res = await app.request("/api/sessions/sess-1/activity", { headers: authHeaders() });
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({
				session: {
					id: "sess-1",
					agentId: "agent-1",
					taskId: "task-1",
					state: "active",
					startedAt: NOW,
					modelTier: "workhorse",
				},
				activity: [],
			});

			const missing = await app.request("/api/sessions/nope/activity", { headers: authHeaders() });
			expect(missing.status).toBe(404);
		});

		test("PATCH /api/sessions/:id writes the effectiveness score", async ({ db, app }) => {
			await seed(db);
			const res = await app.request("/api/sessions/sess-1", {
				method: "PATCH",
				headers: { ...authHeaders(), "content-type": "application/json" },
				body: JSON.stringify({ effectivenessScore: 0.75 }),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { effectivenessScore: string; state: string };
			expect(body.effectivenessScore).toBe("0.75");
			expect(body.state).toBe("active");

			const invalid = await app.request("/api/sessions/sess-1", {
				method: "PATCH",
				headers: { ...authHeaders(), "content-type": "application/json" },
				body: JSON.stringify({ effectivenessScore: 42 }),
			});
			expect(invalid.status).toBe(400);
		});

		test("GET /api/agent-orchestration/sessions still backs the port", async ({ db, app }) => {
			await seed(db);
			const res = await app.request(
				"/api/agent-orchestration/sessions?sourceKind=task&sourceId=task-1",
				{ headers: authHeaders() },
			);
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({ entries: [] });
		});
	});

	test("POST /api/sessions stays core-hosted and returns the whole session row", async ({
		db,
		app,
	}) => {
		await seed(db);
		const res = await app.request("/api/sessions", {
			method: "POST",
			headers: { ...authHeaders(), "content-type": "application/json" },
			body: JSON.stringify({ agentId: "agent-1", taskId: "task-1", modelTier: "fast" }),
		});
		expect(res.status).toBe(201);
		const created = (await res.json()) as Record<string, unknown>;
		const [row] = await db
			.select()
			.from(sessions)
			.where(eq(sessions.id, created.id as string));
		expect(created).toEqual(JSON.parse(JSON.stringify(row)));
	});

	test("AgentOrchestrationPort.sessions.getById returns the full session wire row", async ({
		db,
		app,
	}) => {
		await seed(db);
		const port = buildAgentOrchestrationPort(createInProcessAgentOrchestrationTransport(app));
		const got = await port.sessions.getById("sess-1");
		const [row] = await db.select().from(sessions).where(eq(sessions.id, "sess-1"));
		expect(got).toEqual(JSON.parse(JSON.stringify(row)));
		expect(await port.sessions.getById("nope")).toBeNull();
	});

	test("every relocated route 401s without auth", async ({ db, requestWithoutAuth }) => {
		await seed(db);
		const cases: ReadonlyArray<readonly [string, string]> = [
			["GET", "/api/sessions"],
			["GET", "/api/sessions/starts/start-1"],
			["GET", "/api/sessions/sess-1/activity"],
			["PATCH", "/api/sessions/sess-1"],
			["POST", "/api/sessions"],
			["GET", "/api/agent-orchestration/sessions?sourceKind=task&sourceId=x"],
		];
		for (const [method, path] of cases) {
			const res = await requestWithoutAuth(path, {
				method,
				...(method === "GET"
					? {}
					: { headers: { "content-type": "application/json" }, body: "{}" }),
			});
			expect(res.status, `${method} ${path}`).toBe(401);
		}
	});

	test("the two apps do not shadow each other — zero duplicate method+path", async ({
		db,
		eventBus,
	}) => {
		const orchestration = await bootAgentOrchestration({ db, eventBus });
		const coreOnly = await createCoreApiApp({
			db,
			eventBus,
			agentOrchestration: buildAgentOrchestrationPort(async (req) => orchestration.app.fetch(req)),
		});

		// @lore AU26 B1b: BOTH Layer apps are now bare route tables that the
		// Application mounts at `/` on its own `/api` router, so their path
		// strings are directly comparable — neither carries the `/api` prefix.
		const orchKeys = new Set(routeKeys(orchestration.app));
		const collisions = [...routeKeys(coreOnly)].filter((k) => orchKeys.has(k));
		expect(collisions).toEqual([]);

		// …and the moved routes really are orchestration's: core alone does not serve them.
		expect([...routeKeys(coreOnly)]).not.toContain("GET /sessions/:id/activity");
		expect(orchKeys.has("GET /sessions/:id/activity")).toBe(true);
		expect([...routeKeys(coreOnly)]).toContain("POST /sessions");
		orchestration.dispose();
	});

	test("an unknown /api path still gets the canonical JSON 404", async ({ app }) => {
		const res = await app.request("/api/definitely-not-a-route", { headers: authHeaders() });
		expect(res.status).toBe(404);
		expect(res.headers.get("content-type")).toContain("application/json");
		expect(await res.json()).toEqual({ error: "Not found", code: "NOT_FOUND" });
	});
});
