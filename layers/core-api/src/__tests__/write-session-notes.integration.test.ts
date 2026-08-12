import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildToolDefinitions } from "@hyperidle/agent-orchestration";
import type { CoreApiTransport } from "@hyperidle/api-contract";
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
import type { ScopedIds } from "@hyperidle/db/test-fixtures";
import { EventBus } from "@hyperidle/event-bus";
import type { ToolContext } from "@hyperidle/tool-protocol";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

/**
 * @lore AU31 §3.2/B2: `write_session_notes` never reaches `ports.coreApi.*`
 * (it writes the sandbox file + `sessions.notes` directly) — the factory
 * still needs A transport value to build the full tool list, but this one
 * is provably never invoked, so a transport that throws if called is more
 * honest than wiring a real `app` this tool never touches.
 */
const neverCalledTransport: CoreApiTransport = () => {
	throw new Error("write_session_notes does not reach the CoreApiPort seam");
};

const writeSessionNotesTool = buildToolDefinitions(neverCalledTransport).find(
	(t) => t.name === "write_session_notes",
)!;

async function seed(db: HyperIdleDb, ids: ScopedIds): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({ id: ids("p1"), name: "Test", phase: "build", createdAt: now });
	await db
		.insert(teamMembers)
		.values({ id: ids("t1"), teamId: ids("p1"), capacity: 5, activeBets: 0, formedAt: now });

	await db.insert(bets).values({
		id: ids("b1"),
		teamId: ids("p1"),
		description: "Test",
		appetite: "small",
		status: "active",
		createdAt: now,
	});

	await db.insert(users).values({
		id: ids("agent-a"),
		name: "A",
		role: "builder",
		teamId: ids("t1"),
		status: "active",
		createdAt: now,
	});
	// @lore AU26 G1: the run config left `users` for `agent_run_config`.
	await db.insert(agentRunConfig).values({
		agentUserId: ids("agent-a"),
		maxConcurrentSessions: 2,
	});

	await db.insert(threads).values({
		id: ids("thread-task-1"),
		hostKind: "task",
		hostId: ids("task-1"),
		initiatorId: ids("agent-1"),
		participants: JSON.stringify([ids("agent-1")]),
		lastActiveAt: now,
		createdAt: now,
	});

	await db.insert(tasks).values({
		id: ids("task-1"),
		betId: ids("b1"),
		teamId: ids("p1"),
		ownerAgentId: ids("agent-a"),
		title: "T",
		state: "in_progress",
		threadId: ids("thread-task-1"),
		createdAt: now,
		updatedAt: now,
	});

	await db.insert(sessions).values({
		id: ids("session-1"),
		taskId: ids("task-1"),
		agentId: ids("agent-a"),
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

	function makeContext(db: HyperIdleDb, ids: ScopedIds): ToolContext<HyperIdleDb> {
		return {
			db,
			eventBus: new EventBus(),
			agentId: ids("agent-a"),
			sessionId: ids("session-1"),
			taskId: ids("task-1"),
			sandboxPath,
			ingestion: { dispose: (): void => {} },
		};
	}

	describe("AC7: writes to work/session-notes.md, reflected in sessions.notes", () => {
		test("writes the file at work/session-notes.md", async ({ db, ids }) => {
			await seed(db, ids);
			const result = await writeSessionNotesTool.handler(
				{ notes: "Reflection X" },
				makeContext(db, ids),
			);
			expect(result.success).toBe(true);

			const filePath = path.join(sandboxPath, "work", "session-notes.md");
			expect(fs.existsSync(filePath)).toBe(true);
			expect(fs.readFileSync(filePath, "utf-8")).toBe("Reflection X");
		});

		test("updates sessions.notes in the database", async ({ db, ids }) => {
			await seed(db, ids);
			const result = await writeSessionNotesTool.handler(
				{ notes: "Reflection X" },
				makeContext(db, ids),
			);
			expect(result.success).toBe(true);

			const [session] = await db
				.select()
				.from(sessions)
				.where(eq(sessions.id, ids("session-1")));
			expect(session?.notes).toBe("Reflection X");
		});

		test("creates the work/ subdirectory if missing", async ({ db, ids }) => {
			await seed(db, ids);
			const result = await writeSessionNotesTool.handler({ notes: "Hello" }, makeContext(db, ids));
			expect(result.success).toBe(true);
			expect(fs.existsSync(path.join(sandboxPath, "work"))).toBe(true);
		});

		test("overwrites by default (no append)", async ({ db, ids }) => {
			await seed(db, ids);
			await writeSessionNotesTool.handler({ notes: "First" }, makeContext(db, ids));
			await writeSessionNotesTool.handler({ notes: "Second" }, makeContext(db, ids));
			const filePath = path.join(sandboxPath, "work", "session-notes.md");
			expect(fs.readFileSync(filePath, "utf-8")).toBe("Second");
		});

		test("concatenates when append=true", async ({ db, ids }) => {
			await seed(db, ids);
			await writeSessionNotesTool.handler({ notes: "First" }, makeContext(db, ids));
			await writeSessionNotesTool.handler({ notes: "Second", append: true }, makeContext(db, ids));
			const filePath = path.join(sandboxPath, "work", "session-notes.md");
			const contents = fs.readFileSync(filePath, "utf-8");
			expect(contents).toContain("First");
			expect(contents).toContain("Second");
		});
	});

	describe("AC9: invalid input returns structured error", () => {
		test("returns INVALID_INPUT when notes is not a string", async ({ db, ids }) => {
			await seed(db, ids);
			const result = await writeSessionNotesTool.handler(
				// biome-ignore lint/suspicious/noExplicitAny: deliberately invalid
				{ notes: 42 } as any,
				makeContext(db, ids),
			);
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});

		test("returns INVALID_INPUT when notes missing", async ({ db, ids }) => {
			await seed(db, ids);
			const result = await writeSessionNotesTool.handler(
				// biome-ignore lint/suspicious/noExplicitAny: deliberately invalid
				{} as any,
				makeContext(db, ids),
			);
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});
	});
});
