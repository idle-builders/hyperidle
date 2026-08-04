import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	agentRunConfig,
	bets,
	type HyperIdleDb,
	sessions,
	tasks,
	teamMembers,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { EventBus, type ToolContext } from "@hyperidle/shared";
import { buildToolDefinitions } from "@hyperidle/tool-handlers";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect } from "vitest";
import { toolHandlersPorts } from "../services/tool-handlers-bindings.js";
import { test } from "../test-fixtures.js";

const writeSessionNotesTool = buildToolDefinitions(toolHandlersPorts).find(
	(t) => t.name === "write_session_notes",
)!;

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

	await db.insert(users).values({
		id: "agent-a",
		name: "A",
		role: "builder",
		teamId: "t1",
		status: "active",
		createdAt: now,
	});
	// @lore AU26 G1: the run config left `users` for `agent_run_config`.
	await db.insert(agentRunConfig).values({
		agentUserId: "agent-a",
		maxConcurrentSessions: 2,
	});

	await db.insert(threads).values({
		id: "thread-task-1",
		hostKind: "task",
		hostId: "task-1",
		initiatorId: "agent-1",
		participants: JSON.stringify(["agent-1"]),
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

describe("write_session_notes tool", () => {
	// sandboxPath is per-describe, created and cleaned per test run via beforeEach/afterEach.
	// These are plain vitest lifecycle hooks (not fixture-injected), used solely for
	// filesystem setup — no db/app fixture injection needed here.
	let sandboxPath: string;

	beforeEach(() => {
		sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "hi-d4-notes-"));
	});

	afterEach(() => {
		if (fs.existsSync(sandboxPath)) {
			fs.rmSync(sandboxPath, { recursive: true, force: true });
		}
	});

	function makeContext(db: HyperIdleDb): ToolContext<HyperIdleDb> {
		return {
			db,
			eventBus: new EventBus(),
			agentId: "agent-a",
			sessionId: "session-1",
			taskId: "task-1",
			sandboxPath,
			ingestion: { dispose: (): void => {} },
		};
	}

	describe("AC7: writes to work/session-notes.md, reflected in sessions.notes", () => {
		test("writes the file at work/session-notes.md", async ({ db }) => {
			await seed(db);
			const result = await writeSessionNotesTool.handler(
				{ notes: "Reflection X" },
				makeContext(db),
			);
			expect(result.success).toBe(true);

			const filePath = path.join(sandboxPath, "work", "session-notes.md");
			expect(fs.existsSync(filePath)).toBe(true);
			expect(fs.readFileSync(filePath, "utf-8")).toBe("Reflection X");
		});

		test("updates sessions.notes in the database", async ({ db }) => {
			await seed(db);
			const result = await writeSessionNotesTool.handler(
				{ notes: "Reflection X" },
				makeContext(db),
			);
			expect(result.success).toBe(true);

			const [session] = await db.select().from(sessions).where(eq(sessions.id, "session-1"));
			expect(session?.notes).toBe("Reflection X");
		});

		test("creates the work/ subdirectory if missing", async ({ db }) => {
			await seed(db);
			const result = await writeSessionNotesTool.handler({ notes: "Hello" }, makeContext(db));
			expect(result.success).toBe(true);
			expect(fs.existsSync(path.join(sandboxPath, "work"))).toBe(true);
		});

		test("overwrites by default (no append)", async ({ db }) => {
			await seed(db);
			await writeSessionNotesTool.handler({ notes: "First" }, makeContext(db));
			await writeSessionNotesTool.handler({ notes: "Second" }, makeContext(db));
			const filePath = path.join(sandboxPath, "work", "session-notes.md");
			expect(fs.readFileSync(filePath, "utf-8")).toBe("Second");
		});

		test("concatenates when append=true", async ({ db }) => {
			await seed(db);
			await writeSessionNotesTool.handler({ notes: "First" }, makeContext(db));
			await writeSessionNotesTool.handler({ notes: "Second", append: true }, makeContext(db));
			const filePath = path.join(sandboxPath, "work", "session-notes.md");
			const contents = fs.readFileSync(filePath, "utf-8");
			expect(contents).toContain("First");
			expect(contents).toContain("Second");
		});
	});

	describe("AC9: invalid input returns structured error", () => {
		test("returns INVALID_INPUT when notes is not a string", async ({ db }) => {
			await seed(db);
			const result = await writeSessionNotesTool.handler(
				// biome-ignore lint/suspicious/noExplicitAny: deliberately invalid
				{ notes: 42 } as any,
				makeContext(db),
			);
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});

		test("returns INVALID_INPUT when notes missing", async ({ db }) => {
			await seed(db);
			const result = await writeSessionNotesTool.handler(
				// biome-ignore lint/suspicious/noExplicitAny: deliberately invalid
				{} as any,
				makeContext(db),
			);
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});
	});
});
