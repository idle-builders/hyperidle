/**
 * `create_artifact` works — proven across the seam, not up to it.
 *
 * This replaces the R6 end-to-end test that was deleted with the artifacts
 * table. That test built the REAL tool definitions over a real in-process
 * transport, invoked the handler, and then read the result back through the
 * API. Its replacement in `tool-handlers` captures the port call with a spy and
 * never reaches the server — which is precisely how `layer: null` shipped: the
 * tool sent a value the route rejects, every call would have 400'd, and a
 * spy-based test stayed green because it only ever saw what the caller passed.
 *
 * So this asserts what a spy cannot: the handler's payload is one the running
 * route actually ACCEPTS, and the row it creates is really there afterwards.
 *
 * Not a harness test — no real agent, no LLM. It proves the tool, not the
 * model's willingness to call it. AC7 and AC8's harness lanes remain unwritten,
 * and the plan says so.
 */

import {
	buildToolDefinitions,
	createInProcessCoreApiTransport,
} from "@hyperidle/agent-orchestration";
import { type HyperIdleDb, tasks, teams, threads, users } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/event-bus";
import type { ToolContext } from "@hyperidle/harness-protocol";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-create-artifact-e2e";
const NOW = "2026-09-08T00:00:00.000Z";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

/**
 * @lore §8 B1: this file's `context()` never sets `teamId` (an assistant
 * session's real shape — see its own comment), so `create_artifact`'s
 * `ctx.teamId ?? openTask(...)` fallback is always reached — the documented
 * case an `openTask` binding is injected for, not `THROWING_OPEN_TASK`.
 */
function realOpenTask(
	db: HyperIdleDb,
): (
	id: string,
	actorId: string,
) => Promise<
	{ readonly task: { readonly parentTaskId: string | null; readonly teamId: string } } | undefined
> {
	return async (id) => {
		const [row] = await db.select().from(tasks).where(eq(tasks.id, id));
		if (!row) return undefined;
		return { task: { parentTaskId: row.parentTaskId, teamId: row.teamId } };
	};
}

function createArtifactTool(
	app: Hono,
	db: HyperIdleDb,
): ReturnType<typeof buildToolDefinitions>[number] {
	const tool = buildToolDefinitions(createInProcessCoreApiTransport(app), realOpenTask(db)).find(
		(t) => t.name === "create_artifact",
	);
	if (!tool) throw new Error("create_artifact tool not found in the built definitions");
	return tool;
}

async function seed(db: HyperIdleDb): Promise<{ taskId: string; threadId: string }> {
	await db.insert(teams).values({ id: "ca-team", name: "T", phase: "build", createdAt: NOW });
	await db.insert(users).values({
		id: "ca-agent",
		kind: "ai",
		name: "Builder",
		role: "builder",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(threads).values({
		id: `thr-${"ca-task"}`,
		hostKind: "team",
		hostId: "ca-team",
		initiatorId: "system:propagation",
		participants: "[]",
		lastActiveAt: NOW,
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		threadId: `thr-${"ca-task"}`,
		id: "ca-task",
		parentTaskId: null,
		teamId: "ca-team",
		title: "Produce something",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(threads).values({
		id: "ca-thread",
		hostKind: "user",
		hostId: "ca-agent",
		initiatorId: "ca-agent",
		participants: JSON.stringify(["ca-agent"]),
		lastActiveAt: NOW,
		createdAt: NOW,
	});
	return { taskId: "ca-task", threadId: "ca-thread" };
}

function context(
	db: HyperIdleDb,
	eventBus: EventBus,
	over: { taskId?: string; threadId?: string },
): ToolContext<HyperIdleDb> {
	return {
		db,
		eventBus,
		agentId: "ca-agent",
		sessionId: "ca-session",
		// An assistant session carries the EMPTY STRING here, not undefined
		// (`provisioner.ts`), which is why the tool tests truthiness rather than
		// presence when it decides which parent to use.
		taskId: over.taskId ?? "",
		...(over.threadId ? { threadId: over.threadId } : {}),
		sandboxPath: "/tmp/ca-sandbox",
		ingestion: { dispose: (): void => {} },
	} as ToolContext<HyperIdleDb>;
}

interface ItemView {
	readonly id: string;
	readonly title: string;
	readonly body: string;
	readonly parentKind: string | null;
	readonly parentId: string | null;
	readonly role: string;
	readonly status: string;
	readonly format: string;
}

describe("create_artifact, driven through the real route", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("in a task session it produces a knowledge item the API serves back", async ({
		db,
		app,
		eventBus,
	}) => {
		const { taskId } = await seed(db);
		const BODY = "# Test results\n\n12 passed, 0 failed.";

		const result = await createArtifactTool(app, db).handler(
			{ title: "Test results", body: BODY },
			context(db, eventBus, { taskId }),
		);

		// The handler crossing the seam is the point: a payload the route refuses
		// fails HERE, where a spy would have recorded it and passed.
		expect(result.success).toBe(true);
		if (!result.success) return;
		const { knowledgeItemId } = result.data as { knowledgeItemId: string };
		expect(knowledgeItemId).toBeTruthy();

		const res = await app.request(`/api/knowledge/${knowledgeItemId}`, {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);

		const item = (await res.json()) as ItemView;
		expect(item.parentKind).toBe("task");
		expect(item.parentId).toBe(taskId);
		expect(item.role).toBe("ordinary");
		expect(item.format).toBe("markdown");
		expect(item.body).toBe(BODY);
	});

	test("in a conversation it parents to the thread instead", async ({ db, app, eventBus }) => {
		const { threadId } = await seed(db);

		const result = await createArtifactTool(app, db).handler(
			{ title: "Produced in a conversation", body: "Content." },
			context(db, eventBus, { threadId }),
		);

		expect(result.success).toBe(true);
		if (!result.success) return;
		const { knowledgeItemId } = result.data as { knowledgeItemId: string };

		const res = await app.request(`/api/knowledge/${knowledgeItemId}`, {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const item = (await res.json()) as ItemView;
		expect(item.parentKind).toBe("thread");
		expect(item.parentId).toBe(threadId);
	});

	test("an interactive artifact survives the round trip byte-for-byte", async ({
		db,
		app,
		eventBus,
	}) => {
		const { taskId } = await seed(db);
		// A body whose ONLY block is a fenced html block is what renders in the
		// sandbox frame. If the round trip mangles it, it renders as source.
		const BODY = '```html\n<div id="x">hi</div>\n<script>document.title="ran"</script>\n```';

		const result = await createArtifactTool(app, db).handler(
			{ title: "Interactive", body: BODY },
			context(db, eventBus, { taskId }),
		);
		expect(result.success).toBe(true);
		if (!result.success) return;
		const { knowledgeItemId } = result.data as { knowledgeItemId: string };

		const res = await app.request(`/api/knowledge/${knowledgeItemId}`, {
			headers: authHeaders(),
		});
		const item = (await res.json()) as ItemView;
		expect(item.body).toBe(BODY);
	});

	test("with neither a task nor a thread it refuses, rather than orphaning the item", async ({
		db,
		app,
		eventBus,
	}) => {
		await seed(db);

		const result = await createArtifactTool(app, db).handler(
			{ title: "Nowhere to live", body: "Content." },
			context(db, eventBus, {}),
		);

		expect(result.success).toBe(false);
	});

	test("the produced item is NOT in the knowledge tree", async ({ db, app, eventBus }) => {
		const { taskId } = await seed(db);

		const result = await createArtifactTool(app, db).handler(
			{ title: "Task residue", body: "Content." },
			context(db, eventBus, { taskId }),
		);
		expect(result.success).toBe(true);

		const res = await app.request("/api/knowledge", { headers: authHeaders() });
		const listed = (await res.json()) as { items: ReadonlyArray<{ title: string }> };
		expect(listed.items.map((i) => i.title)).not.toContain("Task residue");
	});
});
