/**
 * R6 — Artifacts Pipeline: Integration tests proving end-to-end artifact creation flow.
 *
 * These tests prove acceptance criteria AC2, AC3, and AC4:
 *   AC2 — Artifacts created by agent sessions appear in WorkBet ArtifactSection
 *          (GET /api/artifacts?axis=bet&betId=X returns the artifact)
 *   AC3 — Artifacts appear in WorkPortfolio artifact gallery
 *          (GET /api/artifacts?axis=portfolio returns the artifact)
 *   AC4 — Artifact metadata (kind, cost, timestamp) renders correctly in response
 *
 * Architecture plan §5 (Task 5): seed domain, build ToolContext, invoke handler,
 * query API, assert artifact appears.
 *
 * These tests WILL fail until:
 *   - create-artifact.ts is implemented (Task 3)
 *   - ArtifactCreatedEvent is in events.ts (Task 2)
 */

import * as os from "node:os";
import * as path from "node:path";
import {
	bets,
	type HyperIdleDb,
	tasks,
	teamMembers,
	teams,
} from "@hyperidle/db";
import { type EventBus } from "@hyperidle/shared";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../test-fixtures.js";
// Will fail until create-artifact.ts exists
import { createArtifactTool } from "../create-artifact.js";
import type { ToolContext } from "../tool-registry.js";

const TEST_API_KEY = "test-key-r6-integration";
const NOW = "2026-05-30T00:00:00.000Z";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

interface SeedScope {
	taskId: string;
	betId: string;
	teamId: string;
}

async function seed(db: HyperIdleDb, suffix = ""): Promise<SeedScope> {
	const teamId = `team-r6${suffix}`;
	const betId = `bet-r6${suffix}`;
	const taskId = `task-r6${suffix}`;

	await db
		.insert(teams)
		.values({ id: teamId, name: `R6 Product${suffix}`, phase: "build", createdAt: NOW });
	await db
		.insert(teamMembers)
		.values({ id: `tm-r6${suffix}`, teamId, capacity: 5, activeBets: 0, formedAt: NOW });
	await db.insert(bets).values({
		id: betId,
		teamId,
		description: "R6 Bet",
		appetite: "1w",
		status: "active",
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(tasks).values({
		id: taskId,
		betId,
		teamId,
		title: "R6 Test task",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});

	return { taskId, betId, teamId };
}

function makeContext(db: HyperIdleDb, eventBus: EventBus, taskId: string): ToolContext {
	return {
		db,
		eventBus,
		agentId: "agent-r6-builder",
		sessionId: "session-r6-integration",
		taskId,
		workspacePath: path.join(os.tmpdir(), `hi-r6-integration-${Date.now()}`),
		watcher: { stop: (): void => {} },
	};
}

describe("R6: create_artifact integration — end-to-end flow", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// -------------------------------------------------------------------- AC2
	test("AC2: artifact created by tool appears in GET /api/artifacts?axis=bet", async ({ db, app, eventBus }) => {
		const { taskId, betId } = await seed(db);
		const ctx = makeContext(db, eventBus, taskId);

		const result = await createArtifactTool.handler(
			{
				kind: "verification",
				preview: { kind: "verification", suite: "unit", passed: 12, failed: 0 },
			},
			ctx,
		);

		expect(result.success).toBe(true);
		if (!result.success) return;
		const { artifactId } = result.data as { artifactId: string };

		const res = await app.request(`/api/artifacts?axis=bet&betId=${betId}`, {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);

		const body = (await res.json()) as { items: Array<{ id: string }> };
		const ids = body.items.map((i) => i.id);
		expect(ids).toContain(artifactId);
	});

	// -------------------------------------------------------------------- AC3
	test("AC3: artifact created by tool appears in GET /api/artifacts?axis=portfolio", async ({ db, app, eventBus }) => {
		const { taskId } = await seed(db, "_portfolio");
		const ctx = makeContext(db, eventBus, taskId);

		const result = await createArtifactTool.handler({ kind: "decision", preview: null }, ctx);

		expect(result.success).toBe(true);
		if (!result.success) return;
		const { artifactId } = result.data as { artifactId: string };

		const res = await app.request("/api/artifacts?axis=portfolio", {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);

		const body = (await res.json()) as { items: Array<{ id: string }> };
		const ids = body.items.map((i) => i.id);
		expect(ids).toContain(artifactId);
	});

	// -------------------------------------------------------------------- AC4: full shape via GET /:id
	test("AC4: GET /api/artifacts/:id returns correct kind, producingTaskTitle, cost, threadCount", async ({ db, app, eventBus }) => {
		const { taskId } = await seed(db, "_shape");
		const ctx = makeContext(db, eventBus, taskId);

		const result = await createArtifactTool.handler(
			{
				kind: "verification",
				preview: { kind: "verification", suite: "e2e", passed: 7, failed: 0 },
			},
			ctx,
		);

		expect(result.success).toBe(true);
		if (!result.success) return;
		const { artifactId } = result.data as { artifactId: string };

		const res = await app.request(`/api/artifacts/${artifactId}`, { headers: authHeaders() });
		expect(res.status).toBe(200);

		const body = (await res.json()) as {
			id: string;
			kind: string;
			producingTaskId: string;
			producingTaskTitle: string;
			preview: { kind: string; suite: string; passed: number; failed: number } | null;
			cost: { money: null; tokens: null } | null;
			threadCount: number;
			createdAt: string;
		};

		expect(body.id).toBe(artifactId);
		expect(body.kind).toBe("verification");
		expect(body.producingTaskId).toBe(taskId);
		expect(body.producingTaskTitle).toBe("R6 Test task");

		// Preview must be present and correct.
		expect(body.preview).not.toBeNull();
		expect(body.preview?.kind).toBe("verification");
		expect(body.preview?.suite).toBe("e2e");
		expect(body.preview?.passed).toBe(7);
		expect(body.preview?.failed).toBe(0);

		// @lore O2: cost columns stripped from kernel table; cost always null shape.
		expect(body.cost).toBeDefined();
		if (body.cost) {
			expect(body.cost.money).toBeNull();
			expect(body.cost.tokens).toBeNull();
		}

		// threadCount is 0 (forward-compat shape).
		expect(body.threadCount).toBe(0);

		// createdAt must be a valid ISO string.
		expect(() => new Date(body.createdAt)).not.toThrow();
		expect(new Date(body.createdAt).toISOString()).toBe(body.createdAt);
	});

	// -------------------------------------------------------------------- AC2: axis=task
	test("AC2: artifact appears in GET /api/artifacts?axis=task&taskId=X for the producing task", async ({ db, app, eventBus }) => {
		const { taskId } = await seed(db, "_task");
		const ctx = makeContext(db, eventBus, taskId);

		const result = await createArtifactTool.handler(
			{ kind: "data_analysis", preview: { kind: "data_analysis", findings: ["finding A"] } },
			ctx,
		);

		expect(result.success).toBe(true);
		if (!result.success) return;
		const { artifactId } = result.data as { artifactId: string };

		const res = await app.request(`/api/artifacts?axis=task&taskId=${taskId}`, {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);

		const body = (await res.json()) as { items: Array<{ id: string }> };
		const ids = body.items.map((i) => i.id);
		expect(ids).toContain(artifactId);
	});

	// -------------------------------------------------------------------- isolation
	test("artifact for task A does not appear under axis=task for task B", async ({ db, app, eventBus }) => {
		const scopeA = await seed(db, "_iso-a");
		const scopeB = await seed(db, "_iso-b");

		const ctxA = makeContext(db, eventBus, scopeA.taskId);
		const resultA = await createArtifactTool.handler({ kind: "decision", preview: null }, ctxA);
		expect(resultA.success).toBe(true);
		if (!resultA.success) return;
		const { artifactId: artifactA } = resultA.data as { artifactId: string };

		// Query task B — must NOT contain artifact from task A.
		const res = await app.request(`/api/artifacts?axis=task&taskId=${scopeB.taskId}`, {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { items: Array<{ id: string }> };
		const ids = body.items.map((i) => i.id);
		expect(ids).not.toContain(artifactA);
	});
});
