/**
 * AU26 B1a — the two-app mount.
 *
 * `agent-orchestration` has its own Hono app, mounted beside core-api's on
 * the same `/api` router at unchanged paths, so this file
 * proves the interleaved routing shape the checked-in probe
 * (`.pipeline/work/AU26/probes/two-app-mount/poc4.ts`) predicts:
 *
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
 *
 * @lore `GET /api/sessions` and `GET /api/sessions/:id/activity` are
 * DELETED — `search_sessions`/`watch_session` are the door now
 * (`POST /api/actions/<name>`), proven by the integrate task's seam test,
 * not here. `routes/sessions.ts` (the file both lived in) is gone.
 */

import { bootAgentOrchestration } from "@hyperidle/agent-orchestration";
import { type HyperIdleDb, sessions, tasks, teams, threads, users } from "@hyperidle/db";
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
	await db.insert(teams).values({ id: "prod-1", name: "P", createdAt: NOW });
	await db.insert(users).values({
		id: "agent-1",
		name: "Builder",
		role: "builder",
		status: "active",
		kind: "ai",
		teamId: "prod-1",
		createdAt: NOW,
	});
	await db.insert(users).values({
		id: "human-1",
		name: "Human",
		role: "founder",
		status: "active",
		kind: "human",
		teamId: "prod-1",
		createdAt: NOW,
	});
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

	// GET /api/sessions/starts/:startId (#142) deleted — test removed
	// PATCH /api/sessions/:id (#144) deleted — test removed
	// GET /api/agent-orchestration/sessions (#145) deleted — test removed
	// POST /api/sessions (#114) deleted — test removed
	// GET /api/sessions deleted — search_sessions is the door now
	// GET /api/sessions/:id/activity deleted — watch_session is the door now

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

	test("the plumbing session route 401s without auth", async ({ db, requestWithoutAuth }) => {
		await seed(db);
		// Deleted: #114 POST /sessions, #142 GET /starts/:startId, #144 PATCH /:id,
		// #145 GET /agent-orchestration/sessions, GET /sessions, GET /sessions/:id/activity.
		const res = await requestWithoutAuth("/api/agent-orchestration/sessions/sess-1", {
			method: "GET",
		});
		expect(res.status).toBe(401);
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
		expect([...routeKeys(coreOnly)]).not.toContain("GET /agent-orchestration/sessions/:sessionId");
		expect(orchKeys.has("GET /agent-orchestration/sessions/:sessionId")).toBe(true);
		// orchestration's own /actions mount — stop_session resolves here,
		// never on core's own mount.
		expect([...routeKeys(coreOnly)]).not.toContain("POST /actions/stop_session");
		expect(orchKeys.has("POST /actions/stop_session")).toBe(true);
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
