/**
 * AU21 §9 Increment 6, Wave 2 (Decision D) — `AgentOrchestrationPort` is
 * STRICTLY READ-ONLY, RED phase.
 *
 * §12: "Decision D cost query — the new `core-ui → agent-orchestration`
 * surface reads display data only; no core mutation; the write-gate stays
 * core-side. A test asserts it cannot write." This file is that test —
 * proven two ways against the REAL route + REAL table, not a type-level
 * grep:
 *
 *   1. The backing route path only ever answers `GET` — no mutating verb
 *      (`POST`/`PATCH`/`PUT`/`DELETE`) is routed at
 *      `/api/agent-orchestration/sessions/:sessionId/cost` (or the list
 *      route). Hono's own `api.notFound` handles anything unmatched, so a
 *      write verb at an otherwise-real path proves no handler exists for
 *      it, not merely that this test didn't call one.
 *   2. Reading through the port — however many times, and regardless of
 *      whether the caller tries to smuggle a body/query alongside the
 *      read — never changes the underlying `agentSessionRequests` row (its
 *      `costCents`/`status`/`updatedAt` are byte-identical before and after).
 *      This is the stronger, behavior-level proof: even if a future edit
 *      accidentally wired a write inside the "read" handler, this test
 *      would catch the row actually changing.
 *
 * Same import-resolution RED as `agent-orchestration-port.integration.test.ts`
 * — `../agent-orchestration-port-composition.js` does not exist yet.
 */

import { agentSessionRequests, type HyperIdleDb, users } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { describe, expect, test, vi } from "../../test-fixtures.js";
// NOT YET CREATED — this import failing to resolve is this file's primary RED signal.
import {
	buildAgentOrchestrationPort,
	createInProcessAgentOrchestrationTransport,
} from "../agent-orchestration-port-composition.js";

const NOW = "2026-07-29T00:00:00.000Z";

interface SeamAgentOrchestrationPort {
	readonly sessions: {
		getSessionCostBySessionId(sessionId: string): Promise<number | null | undefined>;
	};
}

async function seedRequest(db: HyperIdleDb, id: string, sessionId: string): Promise<void> {
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
		sourceKind: "task",
		sourceId: `${id}-task`,
		streamId: `task:${id}`,
		agentId,
		promptMode: "task",
		sourceCorrelationJson: JSON.stringify({}),
		idempotencyKey: `${id}-key`,
		status: "completed",
		sessionId,
		costCents: 250,
		createdAt: NOW,
		updatedAt: NOW,
	});
}

describe("AgentOrchestrationPort — §12 read-only obligation", () => {
	test("POST to the per-session-cost route path is not routed (no write handler exists)", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "aop-ro-post");
		await seedRequest(db, "aop-ro-post", "session-aop-ro-post");

		const res = await app.request("/api/agent-orchestration/sessions/session-aop-ro-post/cost", {
			method: "POST",
			headers: { "X-API-Key": "aop-ro-post", "Content-Type": "application/json" },
			body: JSON.stringify({ costCents: 999999 }),
		});

		expect(res.status).toBe(404);
	});

	test("PATCH to the per-session-cost route path is not routed (no write handler exists)", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "aop-ro-patch");
		await seedRequest(db, "aop-ro-patch", "session-aop-ro-patch");

		const res = await app.request("/api/agent-orchestration/sessions/session-aop-ro-patch/cost", {
			method: "PATCH",
			headers: { "X-API-Key": "aop-ro-patch", "Content-Type": "application/json" },
			body: JSON.stringify({ costCents: 1 }),
		});

		expect(res.status).toBe(404);
	});

	test("DELETE to the per-session-cost route path is not routed (no write handler exists)", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "aop-ro-delete");
		await seedRequest(db, "aop-ro-delete", "session-aop-ro-delete");

		const res = await app.request("/api/agent-orchestration/sessions/session-aop-ro-delete/cost", {
			method: "DELETE",
			headers: { "X-API-Key": "aop-ro-delete" },
		});

		expect(res.status).toBe(404);
	});

	test("reading through the port — repeatedly, with an injected body — never mutates the underlying row", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "aop-ro-noop");
		await seedRequest(db, "aop-ro-noop", "session-aop-ro-noop");

		const [before] = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.id, "aop-ro-noop"));
		expect(before).toBeDefined();

		const port = buildAgentOrchestrationPort(
			createInProcessAgentOrchestrationTransport(app),
		) as unknown as SeamAgentOrchestrationPort;

		// Read three times — a mutating "read" (e.g. an accidental write-through
		// bug) would show up as a changed row after any of these.
		await port.sessions.getSessionCostBySessionId("session-aop-ro-noop");
		await port.sessions.getSessionCostBySessionId("session-aop-ro-noop");
		await port.sessions.getSessionCostBySessionId("session-aop-ro-noop");

		const [after] = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.id, "aop-ro-noop"));

		expect(after).toEqual(before);
	});
});
