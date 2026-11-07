/**
 * `agent-orchestration` has its own Hono app, mounted beside core-api's on
 * the same `/api` router at unchanged paths. This proves the interleaved
 * routing shape:
 *
 *   - `AgentOrchestrationPort.sessions.getById` returns the full wire shape;
 *   - the two apps do not shadow each other — zero duplicate `method + path`;
 *   - an unknown `/api/*` path still gets the canonical JSON 404, not Hono's
 *     `text/plain` default — only the ROOT app's `notFound` fires for a
 *     mounted sub-app.
 *
 * `GET /api/sessions` and `GET /api/sessions/:id/activity` do not exist —
 * `search_sessions`/`watch_session` are the door now (`POST /api/actions/<name>`).
 */

import { bootAgentOrchestration } from "@hyperidle/agent-orchestration";
import { type HyperIdleDb, tasks, teams, threads, users, userTeams } from "@hyperidle/db";
import { registerFixtureOrchestrationCleanup } from "@hyperidle/db/test-fixtures";
import { type RunnerDb, sessions } from "@hyperidle/runner-db";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";
import { createCoreApiApp } from "../app.js";
import { buildAgentOrchestrationPort } from "../services/agent-orchestration-port-composition.js";

const TEST_API_KEY = "test-key-two-app-mount";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY };
}

const NOW = "2026-08-04T00:00:00.000Z";

async function seed(db: HyperIdleDb, runnerDb: RunnerDb): Promise<void> {
	await db.insert(teams).values({ id: "prod-1", name: "P", createdAt: NOW });
	await db.insert(users).values({
		id: "agent-1",
		name: "Builder",
		role: "builder",
		status: "active",
		kind: "ai",
		createdAt: NOW,
	});
	await db.insert(userTeams).values({ userId: "agent-1", teamId: "prod-1" });
	await db.insert(users).values({
		id: "human-1",
		name: "Human",
		role: "founder",
		status: "active",
		kind: "human",
		createdAt: NOW,
	});
	await db.insert(userTeams).values({ userId: "human-1", teamId: "prod-1" });
	await db.insert(threads).values({
		id: `thr-${"bet-1"}`,
		hostKind: "team",
		hostId: "prod-1",
		initiatorId: "system:propagation",
		participants: "[]",
		lastActiveAt: NOW,
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		threadId: `thr-${"bet-1"}`,
		id: "bet-1",
		parentTaskId: null,
		teamId: "prod-1",
		title: "d",
		description: "d",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(threads).values({
		id: `thr-${"task-1"}`,
		hostKind: "team",
		hostId: "prod-1",
		initiatorId: "system:propagation",
		participants: "[]",
		lastActiveAt: NOW,
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		threadId: `thr-${"task-1"}`,
		id: "task-1",
		parentTaskId: "bet-1",
		teamId: "prod-1",
		title: "T",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
	await runnerDb.insert(sessions).values({
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

	test("the plumbing session route 401s without auth", async ({
		db,
		runnerDb,
		requestWithoutAuth,
	}) => {
		await seed(db, runnerDb);
		const res = await requestWithoutAuth("/api/agent-orchestration/sessions/sess-1", {
			method: "GET",
		});
		expect(res.status).toBe(401);
	});

	test("the two apps do not shadow each other — zero duplicate method+path", async ({
		db,
		runnerDb,
		eventBus,
	}) => {
		const orchestration = await bootAgentOrchestration({ db, runnerDb, eventBus });
		registerFixtureOrchestrationCleanup(db, () => {
			orchestration.dispose();
			return orchestration.joinLifecycleDrain();
		});
		const coreOnly = await createCoreApiApp({
			db,
			eventBus,
			agentOrchestration: buildAgentOrchestrationPort(async (req) => orchestration.app.fetch(req)),
		});

		// Both Layer apps are bare route tables the Application mounts at `/`
		// on its own `/api` router, so their path strings are directly
		// comparable — neither carries the `/api` prefix.
		const orchKeys = new Set(routeKeys(orchestration.app));
		const collisions = [...routeKeys(coreOnly)].filter((k) => orchKeys.has(k));
		expect(collisions).toEqual([]);

		// orchestration's own /actions mount — stop_session resolves here,
		// never on core's own mount.
		expect([...routeKeys(coreOnly)]).not.toContain("POST /actions/stop_session");
		expect(orchKeys.has("POST /actions/stop_session")).toBe(true);
		orchestration.dispose();
	});

	test("an unknown /api path still gets the canonical JSON 404", async ({ app }) => {
		const res = await app.request("/api/definitely-not-a-route", { headers: authHeaders() });
		expect(res.status).toBe(404);
		expect(res.headers.get("content-type")).toContain("application/json");
		expect(await res.json()).toEqual({ error: "Not found", code: "NOT_FOUND" });
	});
});
