/**
 * BA6 RED — AC1's agent half (`create_task` / `edit_task` tool schemas carry
 * `dependencies`) and AC5's agent half (a cycle rejection reaches the agent as
 * a structured `err(code, message)`, not a generic thrown `Error`).
 *
 * Same in-process seam pattern as `create-task.integration.test.ts`: the REAL
 * app behind `createInProcessCoreApiTransport`, no stub of the seam or the
 * route.
 *
 * @lore BA6 assumption: `dependencies` stays a JSON-encoded string on the
 * tool schemas too, matching `UpdateTaskRequest.dependencies?: string | null`
 * — see the sibling file `BA6-task-dependencies.integration.test.ts` for the
 * full rationale.
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
		.values({ id: "ba6-agent-team", name: "Team", phase: "build", createdAt: NOW });
	await db.insert(users).values({
		id: "ba6-agent-a",
		kind: "ai",
		name: "Builder Agent",
		role: "builder",
		teamId: "ba6-agent-team",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: "ba6-agent-parent",
		parentTaskId: null,
		teamId: "ba6-agent-team",
		title: "Parent",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(tasks).values({
		id: "ba6-agent-own-task",
		parentTaskId: "ba6-agent-parent",
		teamId: "ba6-agent-team",
		ownerAgentId: "ba6-agent-a",
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
		agentId: "ba6-agent-a",
		sessionId: "ba6-session-1",
		taskId: "ba6-agent-own-task",
		sandboxPath: path.join(os.tmpdir(), `hi-ba6-agenttools-${Date.now()}`),
		ingestion: { dispose: (): void => {} },
	};
}

describe("BA6 agent doors: create_task / edit_task carry dependencies", () => {
	test("create_task persists a dependencies value passed by the caller", async ({
		db,
		eventBus,
		app,
	}) => {
		await seed(db);
		const createTaskTool = buildTool(app, "create_task");

		const result = await createTaskTool.handler(
			{ title: "Waits on parent", dependencies: JSON.stringify(["ba6-agent-parent"]) },
			makeContext(db, eventBus),
		);

		expect(result.success).toBe(true);
		if (!result.success) return;
		const data = result.data as { taskId: string };
		const [inserted] = await db.select().from(tasks).where(eq(tasks.id, data.taskId));
		expect(inserted?.dependencies).toBe(JSON.stringify(["ba6-agent-parent"]));
	});

	test("edit_task persists a dependencies value passed by the caller", async ({
		db,
		eventBus,
		app,
	}) => {
		await seed(db);
		await db.insert(tasks).values({
			id: "ba6-agent-editable",
			parentTaskId: "ba6-agent-parent",
			teamId: "ba6-agent-team",
			title: "Editable",
			state: "proposed",
			createdAt: NOW,
			updatedAt: NOW,
		});
		const editTaskTool = buildTool(app, "edit_task");

		const result = await editTaskTool.handler(
			{ taskId: "ba6-agent-editable", dependencies: JSON.stringify(["ba6-agent-parent"]) },
			makeContext(db, eventBus),
		);

		expect(result.success).toBe(true);
		if (!result.success) return;
		const [updated] = await db.select().from(tasks).where(eq(tasks.id, "ba6-agent-editable"));
		expect(updated?.dependencies).toBe(JSON.stringify(["ba6-agent-parent"]));
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
				id: "ba6-agent-cycle-a",
				parentTaskId: "ba6-agent-parent",
				teamId: "ba6-agent-team",
				title: "A",
				state: "proposed",
				dependencies: JSON.stringify(["ba6-agent-cycle-b"]),
				createdAt: NOW,
				updatedAt: NOW,
			},
			{
				id: "ba6-agent-cycle-b",
				parentTaskId: "ba6-agent-parent",
				teamId: "ba6-agent-team",
				title: "B",
				state: "proposed",
				createdAt: NOW,
				updatedAt: NOW,
			},
		]);
		const editTaskTool = buildTool(app, "edit_task");

		const result = await editTaskTool.handler(
			{ taskId: "ba6-agent-cycle-b", dependencies: JSON.stringify(["ba6-agent-cycle-a"]) },
			makeContext(db, eventBus),
		);

		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).not.toBe("INVALID_INPUT");
	});
});
