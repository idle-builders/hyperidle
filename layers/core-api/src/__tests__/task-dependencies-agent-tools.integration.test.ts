/**
 * AC1's agent half (`create_task` / `edit_task` tool schemas carry
 * `dependencies`) and AC5's agent half (a cycle rejection reaches the agent as
 * a structured `err(code, message)`, not a generic thrown `Error`).
 *
 * Same in-process seam pattern as `create-task.integration.test.ts`: the REAL
 * app behind `createInProcessCoreApiTransport`, no stub of the seam or the
 * route.
 *
 * `dependencies` crosses the tool schemas as `string[]` too, same as the
 * human doors — see `task-dependencies.integration.test.ts`.
 */

import * as os from "node:os";
import * as path from "node:path";
import {
	buildToolDefinitions,
	createInProcessCoreApiTransport,
} from "@hyperidle/agent-orchestration";
import { THROWING_REVIEW_ACCESSOR } from "@hyperidle/agent-orchestration/testing";
import { type HyperIdleDb, tasks, teams, users } from "@hyperidle/db";
import type { ToolContext } from "@hyperidle/harness-protocol";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { describe, expect } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

const NOW = new Date().toISOString();

function buildTool(
	app: Hono,
	name: "create_task" | "edit_task",
): ReturnType<typeof buildToolDefinitions>[number] {
	const tool = buildToolDefinitions(
		createInProcessCoreApiTransport(app),
		THROWING_REVIEW_ACCESSOR,
	).find((t) => t.name === name);
	if (!tool) throw new Error(`tool not found: ${name}`);
	return tool;
}

async function seed(db: HyperIdleDb): Promise<void> {
	await db
		.insert(teams)
		.values({ id: "agenttools-agent-team", name: "Team", phase: "build", createdAt: NOW });
	await db.insert(users).values({
		id: "agenttools-agent-a",
		kind: "ai",
		name: "Builder Agent",
		role: "builder",
		teamId: "agenttools-agent-team",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: "agenttools-agent-parent",
		parentTaskId: null,
		teamId: "agenttools-agent-team",
		title: "Parent",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(tasks).values({
		id: "agenttools-agent-own-task",
		parentTaskId: "agenttools-agent-parent",
		teamId: "agenttools-agent-team",
		ownerAgentId: "agenttools-agent-a",
		title: "Own task",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
}

function makeContext(
	db: HyperIdleDb,
	eventBus: import("@hyperidle/event-bus").EventBus,
): ToolContext<HyperIdleDb> {
	return {
		db,
		eventBus,
		agentId: "agenttools-agent-a",
		sessionId: "agenttools-session-1",
		taskId: "agenttools-agent-own-task",
		sandboxPath: path.join(os.tmpdir(), `hi-agenttools-${Date.now()}`),
		ingestion: { dispose: (): void => {} },
	};
}

describe("agent doors: create_task / edit_task carry dependencies", () => {
	test("create_task persists a dependencies value passed by the caller", async ({
		db,
		eventBus,
		app,
	}) => {
		await seed(db);
		const createTaskTool = buildTool(app, "create_task");

		const result = await createTaskTool.handler(
			{ title: "Waits on parent", dependencies: ["agenttools-agent-parent"] },
			makeContext(db, eventBus),
		);

		expect(result.success).toBe(true);
		if (!result.success) return;
		const data = result.data as { taskId: string };
		const [inserted] = await db.select().from(tasks).where(eq(tasks.id, data.taskId));
		expect(inserted?.dependencies).toBe(JSON.stringify(["agenttools-agent-parent"]));
	});

	test("edit_task persists a dependencies value passed by the caller", async ({
		db,
		eventBus,
		app,
	}) => {
		await seed(db);
		await db.insert(tasks).values({
			id: "agt-editable",
			parentTaskId: "agenttools-agent-parent",
			teamId: "agenttools-agent-team",
			title: "Editable",
			state: "proposed",
			createdAt: NOW,
			updatedAt: NOW,
		});
		const editTaskTool = buildTool(app, "edit_task");

		const result = await editTaskTool.handler(
			{ taskId: "agt-editable", dependencies: ["agenttools-agent-parent"] },
			makeContext(db, eventBus),
		);

		expect(result.success).toBe(true);
		if (!result.success) return;
		const [updated] = await db.select().from(tasks).where(eq(tasks.id, "agt-editable"));
		expect(updated?.dependencies).toBe(JSON.stringify(["agenttools-agent-parent"]));
	});

	// AC5, agent half: a cycle refusal must reach the agent as a structured
	// `err(code, message)` — the handler must not let the seam's generic
	// thrown Error escape uncaught. A "code" other than "INVALID_INPUT" is
	// the distinguishing signal that the field was actually read and
	// forwarded (today it is silently dropped by the schema, so the ONLY
	// failure the caller ever sees is "no fields to update").
	test("edit_task on a cycle returns a structured failure, not a thrown Error", async ({
		db,
		eventBus,
		app,
	}) => {
		await seed(db);
		await db.insert(tasks).values([
			{
				id: "agenttools-agent-cycle-a",
				parentTaskId: "agenttools-agent-parent",
				teamId: "agenttools-agent-team",
				title: "A",
				state: "proposed",
				dependencies: JSON.stringify(["agenttools-agent-cycle-b"]),
				createdAt: NOW,
				updatedAt: NOW,
			},
			{
				id: "agenttools-agent-cycle-b",
				parentTaskId: "agenttools-agent-parent",
				teamId: "agenttools-agent-team",
				title: "B",
				state: "proposed",
				createdAt: NOW,
				updatedAt: NOW,
			},
		]);
		const editTaskTool = buildTool(app, "edit_task");

		const result = await editTaskTool.handler(
			{ taskId: "agenttools-agent-cycle-b", dependencies: ["agenttools-agent-cycle-a"] },
			makeContext(db, eventBus),
		);

		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).not.toBe("INVALID_INPUT");
		expect(result.code).toBe("TASK_CYCLE");
	});
});
