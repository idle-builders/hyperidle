/**
 * R6 — Artifacts Pipeline: Integration tests proving end-to-end artifact creation flow.
 *
 * These tests prove acceptance criteria AC2, AC3, and AC4:
 *   AC2 — Artifacts created by agent sessions appear in WorkBet ArtifactSection
 *          (GET /api/artifacts?axis=bet&betId=X returns the artifact)
 *   AC3 — Artifacts appear in WorkPortfolio artifact gallery
 *          (GET /api/artifacts?axis=portfolio returns the artifact)
 *   AC4 — Artifact metadata (kind, timestamp) renders correctly in response
 *     (AU21 Increment 14a: cost metadata HARD-DELETED from this AC, no replacement)
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
	buildToolDefinitions,
	createInProcessCoreApiTransport,
} from "@hyperidle/agent-orchestration";
import { bets, type HyperIdleDb, tasks, teams } from "@hyperidle/db";
import type { ArtifactPreview } from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
import type { ToolContext } from "@hyperidle/harness-protocol";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

function buildCreateArtifactTool(app: Hono): ReturnType<typeof buildToolDefinitions>[number] {
	return buildToolDefinitions(createInProcessCoreApiTransport(app)).find(
		(t) => t.name === "create_artifact",
	)!;
}

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
	await db.insert(bets).values({
		id: betId,
		teamId,
		description: "R6 Bet",
		appetite: "1w",
		status: "active",
		createdAt: NOW,
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

function makeContext(
	db: HyperIdleDb,
	eventBus: EventBus,
	taskId: string,
): ToolContext<HyperIdleDb> {
	return {
		db,
		eventBus,
		agentId: "agent-r6-builder",
		sessionId: "session-r6-integration",
		taskId,
		sandboxPath: path.join(os.tmpdir(), `hi-r6-integration-${Date.now()}`),
		ingestion: { dispose: (): void => {} },
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
	test("AC2: artifact created by tool appears in GET /api/artifacts?axis=bet", async ({
		db,
		app,
		eventBus,
	}) => {
		const createArtifactTool = buildCreateArtifactTool(app);
		const { taskId, betId } = await seed(db);
		const ctx = makeContext(db, eventBus, taskId);

		// @lore AE6: 'verification' mapped to 'data' kind. Using text kind for simplicity.
		const result = await createArtifactTool.handler(
			{
				kind: "text",
				label: "test_results",
				preview: { kind: "text", body: "12 passed, 0 failed", format: "plain" } as ArtifactPreview,
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
	test("AC3: artifact created by tool appears in GET /api/artifacts?axis=portfolio", async ({
		db,
		app,
		eventBus,
	}) => {
		const createArtifactTool = buildCreateArtifactTool(app);
		const { taskId } = await seed(db, "_portfolio");
		const ctx = makeContext(db, eventBus, taskId);

		// @lore AE6: 'decision' mapped to 'text' kind.
		const result = await createArtifactTool.handler({ kind: "text", preview: null }, ctx);

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
	// @lore AU21 Increment 14a: the `cost: { money: null, tokens: null }`
	// always-null shape this AC used to also assert is HARD-DELETED — the
	// `Artifact` wire type carries no `cost` field at all anymore, no
	// replacement.
	test("AC4: GET /api/artifacts/:id returns correct kind, producingTaskTitle, threadCount", async ({
		db,
		app,
		eventBus,
	}) => {
		const createArtifactTool = buildCreateArtifactTool(app);
		const { taskId } = await seed(db, "_shape");
		const ctx = makeContext(db, eventBus, taskId);

		// @lore AE6: Using 'text' kind (was 'verification' in R6). Fundamental kinds only at create time.
		const result = await createArtifactTool.handler(
			{
				kind: "text",
				label: "test_results",
				preview: {
					kind: "text",
					body: "7 passed, 0 failed in e2e",
					format: "plain",
				} as ArtifactPreview,
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
			label: string | null;
			producingTaskId: string;
			producingTaskTitle: string;
			preview: { kind: string; body: string; format?: string } | null;
			threadCount: number;
			createdAt: string;
		};

		expect(body.id).toBe(artifactId);
		expect(body.kind).toBe("text");
		expect(body.label).toBe("test_results");
		expect(body.producingTaskId).toBe(taskId);
		expect(body.producingTaskTitle).toBe("R6 Test task");

		// Preview must be present and correct.
		expect(body.preview).not.toBeNull();
		expect(body.preview?.kind).toBe("text");
		expect(body.preview?.body).toBe("7 passed, 0 failed in e2e");

		// threadCount is 0 (forward-compat shape).
		expect(body.threadCount).toBe(0);

		// createdAt must be a valid ISO string.
		expect(() => new Date(body.createdAt)).not.toThrow();
		expect(new Date(body.createdAt).toISOString()).toBe(body.createdAt);
	});

	// -------------------------------------------------------------------- AC2: axis=task
	test("AC2: artifact appears in GET /api/artifacts?axis=task&taskId=X for the producing task", async ({
		db,
		app,
		eventBus,
	}) => {
		const createArtifactTool = buildCreateArtifactTool(app);
		const { taskId } = await seed(db, "_task");
		const ctx = makeContext(db, eventBus, taskId);

		// @lore AE6: 'data_analysis' mapped to 'text' kind + label='analysis'.
		const result = await createArtifactTool.handler(
			{
				kind: "text",
				label: "analysis",
				preview: { kind: "text", body: "finding A", format: "plain" } as ArtifactPreview,
			},
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
	test("artifact for task A does not appear under axis=task for task B", async ({
		db,
		app,
		eventBus,
	}) => {
		const createArtifactTool = buildCreateArtifactTool(app);
		const scopeA = await seed(db, "_iso-a");
		const scopeB = await seed(db, "_iso-b");

		const ctxA = makeContext(db, eventBus, scopeA.taskId);
		// @lore AE6: 'decision' mapped to 'text' kind.
		const resultA = await createArtifactTool.handler({ kind: "text", preview: null }, ctxA);
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
