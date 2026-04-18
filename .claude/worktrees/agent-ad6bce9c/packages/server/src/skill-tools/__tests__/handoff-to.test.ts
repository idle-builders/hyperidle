import * as os from "node:os";
import * as path from "node:path";
import {
	type HyperIdleDb,
	agents,
	bets,
	createTestDb,
	items,
	products,
	sessions,
	tasks,
	teams,
	threads,
} from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { handoffToTool } from "../handoff-to.js";
import type { ToolContext } from "../tool-registry.js";

function seed(db: HyperIdleDb): void {
	const now = new Date().toISOString();
	db.insert(products).values({ id: "p1", name: "Test", phase: "build", createdAt: now }).run();
	db.insert(teams)
		.values({ id: "t1", productId: "p1", capacity: 5, activeBets: 0, formedAt: now })
		.run();
	db.insert(bets)
		.values({
			id: "b1",
			productId: "p1",
			teamId: "t1",
			pitch: "Test",
			appetite: "small",
			status: "committed",
			createdAt: now,
		})
		.run();
	db.insert(agents)
		.values([
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
		])
		.run();
	db.insert(threads).values({ id: "thread-task-1", kind: "task", createdAt: now }).run();
	db.insert(tasks)
		.values({
			id: "task-1",
			betId: "b1",
			productId: "p1",
			teamId: "t1",
			ownerAgentId: "agent-a",
			title: "T",
			state: "in_progress",
			threadId: "thread-task-1",
			createdAt: now,
			updatedAt: now,
		})
		.run();
	db.insert(sessions)
		.values({
			id: "session-1",
			taskId: "task-1",
			agentId: "agent-a",
			modelTier: "workhorse",
			startedAt: now,
			state: "active",
			cost: 0,
		})
		.run();
}

function makeContext(db: HyperIdleDb): ToolContext {
	return {
		db,
		eventBus: new EventBus(),
		agentId: "agent-a",
		sessionId: "session-1",
		taskId: "task-1",
		workspacePath: path.join(os.tmpdir(), `hi-d4-handoff-${Date.now()}`),
		watcher: { stop: (): void => {} },
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
	let db: HyperIdleDb;

	beforeEach(() => {
		db = createTestDb();
		seed(db);
	});

	describe("AC5: handoff to agent B changes task owner and ends session", () => {
		it("transfers ownership to B and ends A's session", async () => {
			const result = await handoffToTool.handler(
				{ toAgent: "agent-b", ...baseMetadata },
				makeContext(db),
			);
			expect(result.success).toBe(true);
			if (!result.success) return;
			const data = result.data as { status: string; targetAgentId?: string };
			expect(data.status).toBe("success");
			expect(data.targetAgentId).toBe("agent-b");

			const task = db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
			expect(task?.ownerAgentId).toBe("agent-b");

			const session = db.select().from(sessions).where(eq(sessions.id, "session-1")).get();
			expect(session?.state).toBe("done");
		});
	});

	describe("handoff by role", () => {
		it("resolves toRole to an available teammate", async () => {
			// remove direct toAgent option, use toRole
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
		it("creates a review item and transitions task to blocked", async () => {
			const result = await handoffToTool.handler(
				{ toHuman: true, ...baseMetadata, status: "blocked", reason: "need a human" },
				makeContext(db),
			);
			expect(result.success).toBe(true);
			if (!result.success) return;
			const data = result.data as { status: string };
			expect(data.status).toBe("success");

			const task = db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
			expect(task?.state).toBe("blocked");

			const reviewItems = db.select().from(items).all();
			expect(reviewItems.length).toBeGreaterThanOrEqual(1);
			expect(reviewItems.some((i) => i.kind === "review")).toBe(true);
		});
	});

	describe("AC9: invalid input returns structured error", () => {
		it("returns INVALID_INPUT when no target is specified", async () => {
			const result = await handoffToTool.handler(
				// biome-ignore lint/suspicious/noExplicitAny: deliberately invalid
				{ ...baseMetadata } as any,
				makeContext(db),
			);
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});

		it("returns INVALID_INPUT when reason is missing", async () => {
			const result = await handoffToTool.handler(
				// biome-ignore lint/suspicious/noExplicitAny: deliberately invalid
				{ toAgent: "agent-b", contextId: "x", status: "in_progress" } as any,
				makeContext(db),
			);
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});

		it("returns NOT_FOUND when target agent does not exist", async () => {
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
