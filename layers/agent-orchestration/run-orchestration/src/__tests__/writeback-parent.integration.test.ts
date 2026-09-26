/**
 * What an agent writes back hangs off what its session is working on, AND is
 * attributed to who it is — both read from the session's own row, never
 * inferred from where the file happened to land inside the sandbox.
 *
 * The integration point under test is the database: a real `sessions` row
 * (and the real `agentId` FK it carries) read through the real subscriber.
 * The document port stays a port, because it is a port — the seam it dials
 * is covered by the document actions' own tests.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { sessions, tasks, teams, threads, users } from "@hyperidle/db";
import { test } from "@hyperidle/db/test-fixtures";
import type { ActionResult, DocumentRow, DocumentView } from "@hyperidle/domain-model";
import { EventBus } from "@hyperidle/event-bus";
import { afterEach, beforeEach, describe, expect } from "vitest";
import { createWritebackProcessor } from "../writeback-processor.js";

const writeback = createWritebackProcessor();
type DocumentPort = Parameters<typeof writeback.subscribe>[0]["document"];

const NOW = "2026-09-02T00:00:00.000Z";

function ok(
	document: Partial<DocumentRow> & { readonly id: string; readonly version: number },
): ActionResult<DocumentView> {
	return {
		ok: true,
		data: {
			document,
			ancestors: [],
			children: [],
			siblings: [],
			scopeName: "Factory",
		} as DocumentView,
	};
}

function mkDocumentPort(): DocumentPort & { readonly editCalls: unknown[] } {
	const editCalls: unknown[] = [];
	return {
		editCalls,
		async editDocument(caller, input) {
			editCalls.push({ caller, input });
			return ok({ id: "item-1", version: 1, format: "markdown", scopeKind: "factory" });
		},
		async searchDocuments() {
			throw new Error("searchDocuments should not be called in this test");
		},
	};
}

describe("a written-back item hangs off what the session is working on, attributed to the session's agent", () => {
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
	): Promise<{
		readonly document: DocumentPort & { readonly editCalls: unknown[] };
		readonly settled: unknown[];
	}> {
		const bus = new EventBus();
		const document = mkDocumentPort();
		writeback.subscribe({ db, eventBus: bus, document });

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
		return { document, settled: document.editCalls };
	}

	test("a task session parents its produced item to its task, as the session's own agent", async ({
		db,
	}) => {
		await db.insert(teams).values({ id: "wp-team", name: "T", createdAt: NOW });
		await db.insert(users).values({
			id: "wp-agent",
			kind: "ai",
			name: "A",
			role: "builder",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(threads).values({
			id: "thr-wp-task",
			hostKind: "team",
			hostId: "wp-team",
			initiatorId: "wp-agent",
			participants: "[]",
			lastActiveAt: NOW,
			createdAt: NOW,
		});
		await db.insert(tasks).values({
			id: "wp-task",
			threadId: "thr-wp-task",
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

		const { document } = await runWriteback(db, "wp-sess-task");
		expect(document.editCalls).toHaveLength(1);
		expect(document.editCalls[0]).toMatchObject({
			caller: { actor: "wp-agent", sessionId: "wp-sess-task", taskId: "wp-task", threadId: null },
			input: { parent: { kind: "task", id: "wp-task" }, status: "proposed" },
		});
	});

	test("a conversation session parents its produced item to its thread, as the session's own agent", async ({
		db,
	}) => {
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

		const { document } = await runWriteback(db, "wp-sess-conv");
		expect(document.editCalls).toHaveLength(1);
		expect(document.editCalls[0]).toMatchObject({
			caller: {
				actor: "wp-agent-2",
				sessionId: "wp-sess-conv",
				taskId: null,
				threadId: "thr-ast-u1",
			},
			input: { parent: { kind: "thread", id: "thr-ast-u1" } },
		});
	});

	test("a session with neither writes a parentless item rather than guessing, still as its own agent", async ({
		db,
	}) => {
		await db.insert(users).values({
			id: "wp-agent-3",
			kind: "ai",
			name: "A",
			role: "builder",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(sessions).values({
			id: "wp-sess-subscription",
			taskId: null,
			agentId: "wp-agent-3",
			modelTier: "small",
			state: "running",
			sourceKind: "subscription",
			startedAt: NOW,
		});

		const { document } = await runWriteback(db, "wp-sess-subscription");
		expect(document.editCalls).toHaveLength(1);
		const call = document.editCalls[0] as {
			readonly caller: { readonly actor: string };
			readonly input: unknown;
		};
		expect(call.caller.actor).toBe("wp-agent-3");
		expect(call.input).not.toHaveProperty("parent");
	});

	// @lore An unresolvable session has no real `users.id`
	// to attribute a write to — `changes.actor` is an FK, so nothing here may
	// fabricate one (no fallback string satisfies it). Unlike the parent (an
	// honest "don't know" is fine and was always the behaviour), a missing
	// actor is fatal to the whole batch: it is skipped, not written parentless
	// under a made-up identity.
	test("an unknown session writes nothing back — there is no real agent to attribute it to", async ({
		db,
	}) => {
		const { document } = await runWriteback(db, "wp-sess-nonexistent");
		expect(document.editCalls).toHaveLength(0);
	});
});
