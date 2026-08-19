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
 *   - `AgentOrchestrationPort.sessions.getById` returns the full wire shape
 *     (AC5(d));
 *   - the two apps do not shadow each other — zero duplicate `method + path`
 *     (AC10);
 *   - an unknown `/api/*` path still gets the canonical JSON 404, not Hono's
 *     `text/plain` default — only the ROOT app's `notFound` fires for a mounted
 *     sub-app (AC9, the feasibility P1 trap).
 *
 * Removed tests (AU43 delete pass):
 *   - GET /api/sessions/starts/:startId (#142 DELETE)
 *   - PATCH /api/sessions/:id (#144 DELETE)
 *   - GET /api/agent-orchestration/sessions (#145 DELETE)
 *   - POST /api/sessions (#114 DELETE)
 */

import { bootAgentOrchestration } from "@hyperidle/agent-orchestration";
import { bets, type HyperIdleDb, sessions, tasks, teams, users } from "@hyperidle/db";
import { registerFixtureOrchestrationCleanup } from "@hyperidle/db/test-fixtures";
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

	describe("the relocated session routes answer through the composed app", () => {
		test("GET /api/sessions lists, and filters by task_id", async ({ db, app }) => {
			await seed(db);
			const res = await app.request("/api/sessions?task_id=task-1", { headers: authHeaders() });
			expect(res.status).toBe(200);
			const rows = (await res.json()) as ReadonlyArray<{ id: string }>;
			expect(rows.map((r) => r.id)).toEqual(["sess-1"]);

			const none = await app.request("/api/sessions?task_id=task-nope", { headers: authHeaders() });
			expect(await none.json()).toEqual([]);
		});

		// GET /api/sessions/starts/:startId (#142) deleted — test removed
		// PATCH /api/sessions/:id (#144) deleted — test removed
		// GET /api/agent-orchestration/sessions (#145) deleted — test removed

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
	});

	// POST /api/sessions (#114) deleted — test removed

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

	test("every live session route 401s without auth", async ({ db, requestWithoutAuth }) => {
		await seed(db);
		// Deleted: #114 POST /sessions, #142 GET /starts/:startId, #144 PATCH /:id, #145 GET /agent-orchestration/sessions
		const cases: ReadonlyArray<readonly [string, string]> = [
			["GET", "/api/sessions"],
			["GET", "/api/sessions/sess-1/activity"],
		];
		for (const [method, path] of cases) {
			const res = await requestWithoutAuth(path, { method });
			expect(res.status, `${method} ${path}`).toBe(401);
		}
	});

	test("the two apps do not shadow each other — zero duplicate method+path", async ({
		db,
		eventBus,
	}) => {
		const orchestration = await bootAgentOrchestration({ db, eventBus });
		registerFixtureOrchestrationCleanup(db, () => {
			orchestration.dispose();
			return orchestration.joinLifecycleDrain();
		});
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
		// POST /sessions (#114) deleted — assertion removed
		orchestration.dispose();
	});

	test("an unknown /api path still gets the canonical JSON 404", async ({ app }) => {
		const res = await app.request("/api/definitely-not-a-route", { headers: authHeaders() });
		expect(res.status).toBe(404);
		expect(res.headers.get("content-type")).toContain("application/json");
		expect(await res.json()).toEqual({ error: "Not found", code: "NOT_FOUND" });
	});
});
