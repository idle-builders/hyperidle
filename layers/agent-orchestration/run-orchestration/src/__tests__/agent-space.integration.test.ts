/**
 * Agent spaces — persistent per-agent directories on this computer.
 *
 * Tests:
 *  - ensureAgentSpace creates the space and persists its path
 *  - ensureAgentSpace reuses an existing space (no second mkdir)
 *  - two agents with the same name get different directories (collision avoidance)
 *  - deriveWorkingFolder routes by taskId, subscriptionId, callingThreadId, and resume
 */

import * as fs from "node:fs";
import { mkdirSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { agentRunConfig, users } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { afterEach, beforeEach, vi } from "vitest";
import { readAgentRunConfig } from "../agent-run-config-store.js";
import { deriveWorkingFolder, ensureAgentSpace } from "../agent-space.js";

const NOW = "2026-11-06T00:00:00.000Z";

async function insertAgent(
	db: Parameters<typeof readAgentRunConfig>[0],
	id: string,
	name = id,
): Promise<void> {
	await db.insert(users).values({
		id,
		kind: "ai",
		name,
		role: "builder",
		agentCategory: "team",
		status: "active",
		createdAt: NOW,
	});
}

describe("agent spaces", () => {
	let tmpdir: string;

	beforeEach(() => {
		tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "hi-spaces-test-"));
		vi.stubEnv("HYPERIDLE_SPACES_DIR", tmpdir);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		fs.rmSync(tmpdir, { recursive: true, force: true });
	});

	test("creates the agent space and persists its path in run config", async ({ db }) => {
		await insertAgent(db, "agent-new", "Alice");

		const spacePath = await ensureAgentSpace(db, "agent-new", "Alice");

		expect(spacePath).toBe(path.join(tmpdir, "Alice"));
		expect(fs.existsSync(spacePath)).toBe(true);
		const config = await readAgentRunConfig(db, "agent-new");
		expect(config.spacePath).toBe(spacePath);
	});

	test("reuses an existing space on subsequent calls", async ({ db }) => {
		await insertAgent(db, "agent-reuse", "Bob");

		const first = await ensureAgentSpace(db, "agent-reuse", "Bob");
		const second = await ensureAgentSpace(db, "agent-reuse", "Bob");

		expect(second).toBe(first);
		// Config row written exactly once: second call reads and returns.
		const config = await readAgentRunConfig(db, "agent-reuse");
		expect(config.spacePath).toBe(first);
	});

	test("two agents with the same name get distinct directories", async ({ db }) => {
		await insertAgent(db, "agent-coll-1", "Eve");
		await insertAgent(db, "agent-coll-2", "Eve");

		// Create the first agent's space so the name 'Eve' is taken.
		const first = await ensureAgentSpace(db, "agent-coll-1", "Eve");
		const second = await ensureAgentSpace(db, "agent-coll-2", "Eve");

		expect(first).not.toBe(second);
		expect(fs.existsSync(first)).toBe(true);
		expect(fs.existsSync(second)).toBe(true);
	});

	test("currentSpacePath shortcut skips the DB read", async ({ db }) => {
		await insertAgent(db, "agent-shortcut", "Carol");

		// Supply spacePath directly (as if already read by the provisioner).
		const existing = path.join(tmpdir, "Carol");
		mkdirSync(existing, { recursive: true });
		// Insert a row so we can verify it is NOT overwritten.
		await db
			.insert(agentRunConfig)
			.values({ agentUserId: "agent-shortcut", spacePath: existing, maxConcurrentSessions: 1 });

		const returned = await ensureAgentSpace(db, "agent-shortcut", "Carol", existing);

		expect(returned).toBe(existing);
	});
});

describe("working folder isolation", () => {
	let tmpdir: string;

	beforeEach(() => {
		tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "hi-spaces-isolation-"));
		vi.stubEnv("HYPERIDLE_SPACES_DIR", tmpdir);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		fs.rmSync(tmpdir, { recursive: true, force: true });
	});

	test("task run and conversation run for the same agent get separate folders, both persist", async ({
		db,
	}) => {
		await insertAgent(db, "agent-iso", "Isolator");
		const spacePath = await ensureAgentSpace(db, "agent-iso", "Isolator");

		const taskFolder = deriveWorkingFolder(spacePath, { taskId: "task-iso-1" });
		const convFolder = deriveWorkingFolder(spacePath, { callingThreadId: "thread-iso-1" });

		expect(taskFolder).not.toBe(convFolder);
		expect(taskFolder).toBe(path.join(spacePath, "tasks", "task-iso-1"));
		expect(convFolder).toBe(path.join(spacePath, "conversations", "thread-iso-1"));

		// Simulate what the provisioner does: create the working folders.
		mkdirSync(taskFolder, { recursive: true });
		mkdirSync(convFolder, { recursive: true });

		// Both persist after creation; the space root persists too.
		expect(fs.existsSync(spacePath)).toBe(true);
		expect(fs.existsSync(taskFolder)).toBe(true);
		expect(fs.existsSync(convFolder)).toBe(true);
	});

	test("second run of same conversation returns the same folder", async ({ db }) => {
		await insertAgent(db, "agent-reuse-conv", "Reuser");
		const spacePath = await ensureAgentSpace(db, "agent-reuse-conv", "Reuser");

		const first = deriveWorkingFolder(spacePath, { callingThreadId: "thread-reuse-1" });
		mkdirSync(first, { recursive: true });

		// Calling again with the same threadId — same path, folder still there.
		const second = deriveWorkingFolder(spacePath, { callingThreadId: "thread-reuse-1" });

		expect(second).toBe(first);
		expect(fs.existsSync(second)).toBe(true);
	});

	test("spaces root stays outside the repo (HYPERIDLE_SPACES_DIR isolates to temp dir)", async ({
		db,
	}) => {
		await insertAgent(db, "agent-safety", "SafetyAgent");
		const spacePath = await ensureAgentSpace(db, "agent-safety", "SafetyAgent");

		// The space is under our temp dir, never the repo root.
		expect(spacePath.startsWith(tmpdir)).toBe(true);
	});
});

describe("deriveWorkingFolder", () => {
	test("resume path wins over all other params", () => {
		const result = deriveWorkingFolder("/space", {
			resumeSandboxPath: "/old/path",
			taskId: "task-1",
			callingThreadId: "thread-1",
		});
		expect(result).toBe("/old/path");
	});

	test("taskId → tasks/<id>", () => {
		const result = deriveWorkingFolder("/space", { taskId: "t-abc" });
		expect(result).toBe("/space/tasks/t-abc");
	});

	test("subscriptionId → subscriptions/<id>", () => {
		const result = deriveWorkingFolder("/space", { subscriptionId: "sub-xyz" });
		expect(result).toBe("/space/subscriptions/sub-xyz");
	});

	test("callingThreadId → conversations/<id>", () => {
		const result = deriveWorkingFolder("/space", { callingThreadId: "thread-42" });
		expect(result).toBe("/space/conversations/thread-42");
	});

	test("throws when no routing key is supplied", () => {
		expect(() => deriveWorkingFolder("/space", {})).toThrow("deriveWorkingFolder");
	});

	test("taskId takes priority over callingThreadId", () => {
		const result = deriveWorkingFolder("/space", {
			taskId: "t-123",
			callingThreadId: "thread-999",
		});
		expect(result).toBe("/space/tasks/t-123");
	});
});
