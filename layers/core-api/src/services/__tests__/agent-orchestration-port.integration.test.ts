/**
 * AU21 §9 Increment 6, Wave 2 (Decision D) — `AgentOrchestrationPort`, RED phase.
 *
 * §10: "`AgentOrchestrationPort` — agent-orchestration's own read door,
 * symmetric [to `CoreApiPort`]... session/run history + recent activity."
 * §11: "every `CoreApiPort` method has a contract test invoking it through
 * the in-process transport, asserting it reaches its real backing route and
 * gets the expected response shape" — the SAME tested obligation applies to
 * `AgentOrchestrationPort`, mirrored here exactly against
 * `core-api-port.integration.test.ts` (Increment 1's precedent).
 *
 * @lore AU21 Increment 14a (founder, 2026-08-03): this file's original
 * vehicle test case was `getSessionCostBySessionId` (Increment 6's
 * per-session cost read door). Cost is HARD-DELETED with no replacement —
 * `getSessionCostBySessionId`, its backing `/cost` route, and every test
 * exercising it are gone. This file now proves the SAME contract-test
 * obligations (in-process transport, network-transport location
 * transparency, auth/boundary enforcement) using
 * `listSessionHistoryBySource` — the port's other real, surviving method —
 * as the vehicle.
 *
 * CONFUSION (flagged for reviewer sign-off, not silently assumed) — WHERE
 * the backing route physically lives: `architecture.md` names
 * `AgentOrchestrationPort` "agent-orchestration's own read door", but this
 * codebase's real deployment model (verified: `server-factory.ts`,
 * `app.ts`) has exactly ONE HTTP-serving Layer — `core-api`'s own Hono
 * `app`/`api` sub-router. No `agent-orchestration` package hosts its own
 * listener today; the one precedent of an orchestration-authored route
 * registration (`run-orchestration/src/worker-ingress.ts`'s `/ws/worker`) is
 * mounted via a hook into core-api's SAME shared `app` and implements its
 * OWN bespoke token auth specifically BECAUSE it is registered BEFORE
 * core-api's normal auth/rate-limit/boundary middleware chain — reusing
 * that stack from inside `agent-orchestration` is impossible without
 * `agent-orchestration` importing `@hyperidle/core-api`, which would invert
 * the strict downward-dependency rule this whole work package protects
 * (agent-orchestration must never depend upward on core-api). The already-
 * sanctioned, already-shipped pattern for this exact shape is `app.ts`
 * itself directly importing `@hyperidle/session-requests`'s exported query
 * functions (`findSessionRequest`, `SessionActivityBuffer` from
 * `@hyperidle/run-orchestration`) into a core-api-owned route file — the
 * "against-grain core-api → agent-orchestration" edge §1 already names as
 * sanctioned (a small set of permanent DI reads/ports), NOT the ungoverned
 * "agent-orchestration → core-api" direction this WP exists to fix.
 * DECISION: the backing route is a NEW route file core-api owns and mounts
 * (`layers/core-api/src/routes/agent-orchestration-sessions-routes.ts`,
 * mounted at `/api/agent-orchestration` in `app.ts` beside the other domain
 * routes, behind the SAME auth/boundary/rate-limit stack every other core-
 * api route gets), whose handlers call the existing `listSessionRequests`
 * query function `@hyperidle/session-requests` exports (agent-orchestration's
 * own business logic answering the query — the "door" name reflects who
 * OWNS the data and resolves the query, not literal HTTP-hosting).
 * `AgentOrchestrationPort` still delivers the identical location-
 * transparency value Decision A/C established for `CoreApiPort` (a hand-
 * typed contract + a swappable transport + a tested fidelity obligation) —
 * today's in-process transport happens to point at the SAME physical
 * `AppType` `CoreApiPort` uses; a future split-out agent-orchestration
 * deployable would only change the transport + the route's physical
 * location, never this contract or `tasks.ts`'s call site (the exact "same
 * call site, colocated or split" property AC #1a already proves for
 * `CoreApiPort`).
 */

import { serve } from "@hono/node-server";
import { agentSessionRequests, type HyperIdleDb, users } from "@hyperidle/db";
import { describe, expect, test, vi } from "../../__testing__/test-fixtures.js";
import {
	buildAgentOrchestrationPort,
	createInProcessAgentOrchestrationTransport,
	createNetworkAgentOrchestrationTransport,
} from "../agent-orchestration-port-composition.js";

const NOW = "2026-07-29T00:00:00.000Z";

interface SeamAgentOrchestrationPort {
	readonly sessions: {
		listSessionHistoryBySource(
			sourceKind: string,
			sourceId: string,
		): Promise<
			ReadonlyArray<{
				readonly id: string;
				readonly sessionId: string | null;
				readonly status: string;
			}>
		>;
	};
}

async function seedRequest(
	db: HyperIdleDb,
	id: string,
	opts: {
		readonly sourceKind: string;
		readonly sourceId: string;
		readonly sessionId: string | null;
		readonly status?: string;
	},
): Promise<void> {
	const agentId = `${id}-agent`;
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: "Agent",
		role: "builder",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(agentSessionRequests).values({
		id,
		sourceKind: opts.sourceKind,
		sourceId: opts.sourceId,
		streamId: `${opts.sourceKind}:${opts.sourceId}`,
		agentId,
		promptMode: "task",
		sourceCorrelationJson: JSON.stringify({}),
		idempotencyKey: `${id}-key`,
		status: opts.status ?? "running",
		sessionId: opts.sessionId,
		createdAt: NOW,
		updatedAt: NOW,
	});
}

describe("AgentOrchestrationPort — §11 contract-test harness", () => {
	test("builds an AgentOrchestrationPort over a real in-process core-api app and reaches the real session-history route", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "aop-test-key");
		await seedRequest(db, "aop-happy", {
			sourceKind: "task",
			sourceId: "task-aop-happy",
			sessionId: "session-aop-happy",
		});

		const transport = createInProcessAgentOrchestrationTransport(app);
		const port = buildAgentOrchestrationPort(transport) as unknown as SeamAgentOrchestrationPort;

		const entries = await port.sessions.listSessionHistoryBySource("task", "task-aop-happy");
		expect(entries).toHaveLength(1);
		expect(entries[0]?.id).toBe("aop-happy");
	});

	test("an unknown source resolves an empty array through the real route (not thrown)", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "aop-test-key-404");
		await seedRequest(db, "aop-other", {
			sourceKind: "task",
			sourceId: "task-aop-other",
			sessionId: "session-aop-other",
		});

		const port = buildAgentOrchestrationPort(
			createInProcessAgentOrchestrationTransport(app),
		) as unknown as SeamAgentOrchestrationPort;

		await expect(
			port.sessions.listSessionHistoryBySource("task", "task-does-not-exist"),
		).resolves.toEqual([]);
	});

	test("listSessionHistoryBySource reaches the real route and returns only the source's requests", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "aop-test-key-history");
		await seedRequest(db, "aop-hist-1", {
			sourceKind: "task",
			sourceId: "task-aop-hist",
			sessionId: "session-aop-hist-1",
			status: "completed",
		});
		await seedRequest(db, "aop-hist-2", {
			sourceKind: "task",
			sourceId: "task-aop-hist",
			sessionId: "session-aop-hist-2",
			status: "running",
		});
		// A different source — must NOT be included.
		await seedRequest(db, "aop-hist-other", {
			sourceKind: "task",
			sourceId: "task-aop-other-source",
			sessionId: "session-aop-hist-other",
		});

		const port = buildAgentOrchestrationPort(
			createInProcessAgentOrchestrationTransport(app),
		) as unknown as SeamAgentOrchestrationPort;

		const entries = await port.sessions.listSessionHistoryBySource("task", "task-aop-hist");
		expect(entries).toHaveLength(2);
		expect(entries.map((e) => e.id).sort()).toEqual(["aop-hist-1", "aop-hist-2"]);
	});

	test("AC #1a — the identical listSessionHistoryBySource call succeeds via a real network transport (location transparency)", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "aop-test-key-network");
		await seedRequest(db, "aop-net", {
			sourceKind: "task",
			sourceId: "task-aop-net",
			sessionId: "session-aop-net",
		});

		let resolvePort: (port: number) => void;
		const portPromise = new Promise<number>((resolve) => {
			resolvePort = resolve;
		});
		const server = serve({ fetch: app.fetch, port: 0 }, (info) => {
			resolvePort(info.port);
		});
		const netPort = await portPromise;

		try {
			const baseUrl = `http://127.0.0.1:${netPort}/api`;
			const transport = createNetworkAgentOrchestrationTransport(baseUrl);
			const port = buildAgentOrchestrationPort(transport) as unknown as SeamAgentOrchestrationPort;

			const entries = await port.sessions.listSessionHistoryBySource("task", "task-aop-net");
			expect(entries).toHaveLength(1);
			expect(entries[0]?.id).toBe("aop-net");
		} finally {
			await new Promise<void>((resolve) => server.close(() => resolve()));
		}
	});

	test("auth/boundary middleware genuinely ran — a call with no credentials is rejected, not bypassed", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "aop-test-key-noauth");
		await seedRequest(db, "aop-noauth", {
			sourceKind: "task",
			sourceId: "task-aop-noauth",
			sessionId: "session-aop-noauth",
		});

		// A raw fetch straight at the mounted route, bypassing any port-level
		// header injection — the route itself must still demand HYPERIDLE_API_KEY,
		// same invariant `core-api-port.integration.test.ts` asserts for CoreApiPort.
		const res = await app.request(
			"/api/agent-orchestration/sessions?sourceKind=task&sourceId=task-aop-noauth",
		);
		expect(res.status).not.toBe(200);
	});
});
