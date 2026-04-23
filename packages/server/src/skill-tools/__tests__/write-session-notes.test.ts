import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	agents,
	bets,
	createTestDb,
	type HyperIdleDb,
	products,
	sessions,
	tasks,
	teams,
	threads,
} from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ToolContext } from "../tool-registry.js";
import { writeSessionNotesTool } from "../write-session-notes.js";

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
		.values({
			id: "agent-a",
			name: "A",
			role: "builder",
			teamId: "t1",
			status: "active",
			maxConcurrentSessions: 2,
			createdAt: now,
		})
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

describe("write_session_notes tool", () => {
	let db: HyperIdleDb;
	let workspacePath: string;

	function makeContext(): ToolContext {
		return {
			db,
			eventBus: new EventBus(),
			agentId: "agent-a",
			sessionId: "session-1",
			taskId: "task-1",
			workspacePath,
			watcher: { stop: (): void => {} },
		};
	}

	beforeEach(() => {
		db = createTestDb();
		seed(db);
		workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "hi-d4-notes-"));
	});

	afterEach(() => {
		if (fs.existsSync(workspacePath)) {
			fs.rmSync(workspacePath, { recursive: true, force: true });
		}
	});

	describe("AC7: writes to work/session-notes.md, reflected in sessions.notes", () => {
		it("writes the file at work/session-notes.md", async () => {
			const result = await writeSessionNotesTool.handler({ notes: "Reflection X" }, makeContext());
			expect(result.success).toBe(true);

			const filePath = path.join(workspacePath, "work", "session-notes.md");
			expect(fs.existsSync(filePath)).toBe(true);
			expect(fs.readFileSync(filePath, "utf-8")).toBe("Reflection X");
		});

		it("updates sessions.notes in the database", async () => {
			const result = await writeSessionNotesTool.handler({ notes: "Reflection X" }, makeContext());
			expect(result.success).toBe(true);

			const session = db.select().from(sessions).where(eq(sessions.id, "session-1")).get();
			expect(session?.notes).toBe("Reflection X");
		});

		it("creates the work/ subdirectory if missing", async () => {
			const result = await writeSessionNotesTool.handler({ notes: "Hello" }, makeContext());
			expect(result.success).toBe(true);
			expect(fs.existsSync(path.join(workspacePath, "work"))).toBe(true);
		});

		it("overwrites by default (no append)", async () => {
			await writeSessionNotesTool.handler({ notes: "First" }, makeContext());
			await writeSessionNotesTool.handler({ notes: "Second" }, makeContext());
			const filePath = path.join(workspacePath, "work", "session-notes.md");
			expect(fs.readFileSync(filePath, "utf-8")).toBe("Second");
		});

		it("concatenates when append=true", async () => {
			await writeSessionNotesTool.handler({ notes: "First" }, makeContext());
			await writeSessionNotesTool.handler({ notes: "Second", append: true }, makeContext());
			const filePath = path.join(workspacePath, "work", "session-notes.md");
			const contents = fs.readFileSync(filePath, "utf-8");
			expect(contents).toContain("First");
			expect(contents).toContain("Second");
		});
	});

	describe("AC9: invalid input returns structured error", () => {
		it("returns INVALID_INPUT when notes is not a string", async () => {
			const result = await writeSessionNotesTool.handler(
				// biome-ignore lint/suspicious/noExplicitAny: deliberately invalid
				{ notes: 42 } as any,
				makeContext(),
			);
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});

		it("returns INVALID_INPUT when notes missing", async () => {
			const result = await writeSessionNotesTool.handler(
				// biome-ignore lint/suspicious/noExplicitAny: deliberately invalid
				{} as any,
				makeContext(),
			);
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});
	});
});
