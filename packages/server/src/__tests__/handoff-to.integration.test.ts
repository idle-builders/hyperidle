import * as os from "node:os";
import * as path from "node:path";
import {
	bets,
	type HyperIdleDb,
	items,
	sessions,
	tasks,
	teamMembers,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { EventBus, type ToolContext } from "@hyperidle/shared";
import { createHandoffToTool } from "@hyperidle/tool-handlers";
import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import { toolHandlersPorts } from "../services/tool-handlers-bindings.js";
import { test } from "../test-fixtures.js";

const handoffToTool = createHandoffToTool(toolHandlersPorts);

async function seed(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({ id: "p1", name: "Test", phase: "build", createdAt: now });
	await db
		.insert(teamMembers)
		.values({ id: "t1", teamId: "p1", capacity: 5, activeBets: 0, formedAt: now });
	await db.insert(bets).values({
		id: "b1",
		teamId: "p1",
		description: "Test",
		appetite: "small",
		status: "active",
		createdAt: now,
	});
	await db.insert(users).values([
		{
			id: "agent-a",
			name: "A",
			role: "builder",
			teamId: "t1",
			status: "active",
			maxConcurrentSessions: 2,
			createdAt: now,
		},
		{
			id: "agent-b",
			name: "B",
			role: "builder",
			teamId: "t1",
			status: "active",
			maxConcurrentSessions: 2,
			createdAt: now,
		},
	]);
	await db.insert(threads).values({
		id: "thread-task-1",
		hostKind: "task",
		hostId: "task-1",
		initiatorId: "agent-a",
		participants: JSON.stringify(["agent-a"]),
		lastActiveAt: now,
		createdAt: now,
	});
	await db.insert(tasks).values({
		id: "task-1",
		betId: "b1",
		teamId: "p1",
		ownerAgentId: "agent-a",
		title: "T",
		state: "in_progress",
		threadId: "thread-task-1",
		createdAt: now,
		updatedAt: now,
	});
	await db.insert(sessions).values({
		id: "session-1",
		taskId: "task-1",
		agentId: "agent-a",
		modelTier: "workhorse",
		startedAt: now,
		state: "active",
	});
}

function makeContext(db: HyperIdleDb): ToolContext<HyperIdleDb> {
	return {
		db,
		eventBus: new EventBus(),
		agentId: "agent-a",
		sessionId: "session-1",
		taskId: "task-1",
		sandboxPath: path.join(os.tmpdir(), `hi-d4-handoff-${Date.now()}`),
		ingestion: { dispose: (): void => {} },
	};
}

const baseMetadata = {
	contextId: "ctx-1",
	status: "in_progress" as const,
	reason: "needs builder",
	artifacts: [],
	remainingWork: [],
};

describe("handoff_to tool", () => {
	describe("AC5: handoff to agent B changes task owner and ends session", () => {
		test("transfers ownership to B and ends A's session", async ({ db }) => {
			await seed(db);
			const result = await handoffToTool.handler(
				{ toAgent: "agent-b", ...baseMetadata },
				makeContext(db),
			);
			expect(result.success).toBe(true);
			if (!result.success) return;
			const data = result.data as { status: string; targetAgentId?: string };
			expect(data.status).toBe("success");
			expect(data.targetAgentId).toBe("agent-b");

			const [task] = await db.select().from(tasks).where(eq(tasks.id, "task-1"));
			expect(task?.ownerAgentId).toBe("agent-b");

			const [session] = await db.select().from(sessions).where(eq(sessions.id, "session-1"));
			expect(session?.state).toBe("done");
		});
	});

	describe("handoff by role", () => {
		test("resolves toRole to an available teammate", async ({ db }) => {
			await seed(db);
			const ctx = makeContext(db);
			// agent-a is also builder; handoff to role builder should pick agent-b (excludes self)
			const result = await handoffToTool.handler({ toRole: "builder", ...baseMetadata }, ctx);
			expect(result.success).toBe(true);
			if (!result.success) return;
			const data = result.data as { status: string; targetAgentId?: string };
			expect(data.status).toBe("success");
			expect(data.targetAgentId).toBe("agent-b");
		});
	});

	describe("handoff to human", () => {
		test("creates a review item and transitions task to blocked", async ({ db }) => {
			await seed(db);
			const result = await handoffToTool.handler(
				{ toHuman: true, ...baseMetadata, status: "blocked", reason: "need a human" },
				makeContext(db),
			);
			expect(result.success).toBe(true);
			if (!result.success) return;
			const data = result.data as { status: string };
			expect(data.status).toBe("success");

			const [task] = await db.select().from(tasks).where(eq(tasks.id, "task-1"));
			expect(task?.state).toBe("blocked");

			const reviewItems = await db.select().from(items);
			expect(reviewItems.length).toBeGreaterThanOrEqual(1);
			expect(reviewItems.some((i) => i.kind === "review")).toBe(true);
		});
	});

	describe("AC9: invalid input returns structured error", () => {
		test("returns INVALID_INPUT when no target is specified", async ({ db }) => {
			await seed(db);
			const result = await handoffToTool.handler(
				// biome-ignore lint/suspicious/noExplicitAny: deliberately invalid
				{ ...baseMetadata } as any,
				makeContext(db),
			);
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});

		test("returns INVALID_INPUT when reason is missing", async ({ db }) => {
			await seed(db);
			const result = await handoffToTool.handler(
				// biome-ignore lint/suspicious/noExplicitAny: deliberately invalid
				{ toAgent: "agent-b", contextId: "x", status: "in_progress" } as any,
				makeContext(db),
			);
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});

		test("returns NOT_FOUND when target agent does not exist", async ({ db }) => {
			await seed(db);
			const result = await handoffToTool.handler(
				{ toAgent: "ghost", ...baseMetadata },
				makeContext(db),
			);
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("NOT_FOUND");
		});
	});
});
