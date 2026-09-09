/**
 * What an agent writes back hangs off what its session is working on.
 *
 * A task session's produced items are parented to its task; a conversation
 * session's are parented to the thread it is answering in. The parent is read
 * from the session's own row — its identity — not inferred from where the file
 * happened to land inside the sandbox.
 *
 * The integration point under test is the database: a real `sessions` row read
 * through the real subscriber. The knowledge writer stays a port, because it is
 * a port — the seam it dials is covered by the knowledge route's own tests.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { sessions, tasks, teams, users } from "@hyperidle/db";
import { test } from "@hyperidle/db/test-fixtures";
import { EventBus } from "@hyperidle/event-bus";
import { afterEach, beforeEach, describe, expect } from "vitest";
import { createWritebackProcessor } from "../writeback-processor.js";

const writeback = createWritebackProcessor();
type KnowledgeWriter = Parameters<typeof writeback.subscribe>[0]["knowledge"];
type KnowledgeItem = Awaited<ReturnType<KnowledgeWriter["create"]>>;

const NOW = "2026-09-02T00:00:00.000Z";

function mkKnowledgeWriter(): KnowledgeWriter & { readonly createCalls: unknown[] } {
	const createCalls: unknown[] = [];
	const created: KnowledgeItem = { id: "item-1", version: 1, format: "markdown" };
	return {
		createCalls,
		async create(_db, input) {
			createCalls.push(input);
			return created;
		},
		async update() {
			throw new Error("update should not be called in this test");
		},
		async recordConflict() {
			throw new Error("recordConflict should not be called in this test");
		},
		async reparentKnowledgeItem() {
			throw new Error("reparentKnowledgeItem should not be called in this test");
		},
	};
}

describe("a written-back item hangs off what the session is working on", () => {
	let tmpDir: string;
	let manifestPath: string;
	let notePath: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "writeback-parent-"));
		fs.mkdirSync(path.join(tmpDir, "knowledge"), { recursive: true });
		manifestPath = path.join(tmpDir, "manifest.json");
		fs.writeFileSync(
			manifestPath,
			JSON.stringify({ session_id: "s", assembled_at: NOW, items: {} }),
		);
		notePath = path.join(tmpDir, "knowledge", "note.md");
		fs.writeFileSync(notePath, "what the agent produced");
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	async function runWriteback(
		db: Parameters<typeof writeback.subscribe>[0]["db"],
		sessionId: string,
	): Promise<unknown> {
		const bus = new EventBus();
		const knowledge = mkKnowledgeWriter();
		writeback.subscribe({ db, eventBus: bus, knowledge });

		bus.emit({
			type: "sandbox_writeback_changes_detected",
			streamId: sessionId,
			sessionId,
			sandboxPath: tmpDir,
			manifestPath,
			changes: [{ type: "create", relativePath: "knowledge/note.md", fullPath: notePath }],
			timestamp: Date.now(),
		});

		// The subscriber is fire-and-forget — wait for it to settle.
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(knowledge.createCalls).toHaveLength(1);
		return knowledge.createCalls[0];
	}

	test("a task session parents its produced item to its task", async ({ db }) => {
		await db.insert(teams).values({ id: "wp-team", name: "T", phase: "build", createdAt: NOW });
		await db.insert(users).values({
			id: "wp-agent",
			kind: "ai",
			name: "A",
			role: "builder",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(tasks).values({
			id: "wp-task",
			parentTaskId: null,
			teamId: "wp-team",
			title: "T",
			state: "in_progress",
			createdAt: NOW,
			updatedAt: NOW,
		});
		await db.insert(sessions).values({
			id: "wp-sess-task",
			taskId: "wp-task",
			agentId: "wp-agent",
			modelTier: "small",
			state: "running",
			startedAt: NOW,
		});

		expect(await runWriteback(db, "wp-sess-task")).toMatchObject({
			parent: { kind: "task", id: "wp-task" },
			status: "proposed",
		});
	});

	test("a conversation session parents its produced item to its thread", async ({ db }) => {
		await db.insert(users).values({
			id: "wp-agent-2",
			kind: "ai",
			name: "A",
			role: "builder",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(sessions).values({
			id: "wp-sess-conv",
			taskId: null,
			agentId: "wp-agent-2",
			modelTier: "small",
			state: "running",
			sourceKind: "assistant",
			sourceCorrelationJson: JSON.stringify({ threadId: "thr-ast-u1", messageId: "m1" }),
			startedAt: NOW,
		});

		expect(await runWriteback(db, "wp-sess-conv")).toMatchObject({
			parent: { kind: "thread", id: "thr-ast-u1" },
		});
	});

	test("a session with neither writes a parentless item rather than guessing", async ({ db }) => {
		await db.insert(users).values({
			id: "wp-agent-3",
			kind: "ai",
			name: "A",
			role: "builder",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(sessions).values({
			id: "wp-sess-routine",
			taskId: null,
			agentId: "wp-agent-3",
			modelTier: "small",
			state: "running",
			sourceKind: "routine",
			startedAt: NOW,
		});

		expect(await runWriteback(db, "wp-sess-routine")).not.toHaveProperty("parent");
	});

	test("an unknown session still writes the item back, parentless", async ({ db }) => {
		expect(await runWriteback(db, "wp-sess-nonexistent")).not.toHaveProperty("parent");
	});
});
