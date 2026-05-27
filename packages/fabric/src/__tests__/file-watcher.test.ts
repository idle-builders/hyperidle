import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	bets,
	createTestDb,
	type HyperIdleDb,
	knowledgeConflicts,
	knowledgeItems,
	knowledgeStrategyFabric,
	products,
	sessions,
	tasks,
	teams,
	users,
} from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startWatcher } from "../file-watcher.js";
import type { Manifest } from "../materialization.js";
import { startPollingWatcher } from "../polling-watcher.js";
import { processWriteback, readManifest, type WritebackChange } from "../writeback.js";

// Helpers for test setup
function createWorkspace(tmpDir: string): string {
	const workspace = path.join(tmpDir, "workspace");
	fs.mkdirSync(path.join(workspace, "context"), { recursive: true });
	fs.mkdirSync(path.join(workspace, "knowledge/practices"), { recursive: true });
	fs.mkdirSync(path.join(workspace, "knowledge/decisions"), { recursive: true });
	fs.mkdirSync(path.join(workspace, "knowledge/failures"), { recursive: true });
	fs.mkdirSync(path.join(workspace, "work/artifacts"), { recursive: true });
	fs.mkdirSync(path.join(workspace, ".fabric"), { recursive: true });
	return workspace;
}

function createManifest(workspace: string, sessionId: string): string {
	const manifestPath = path.join(workspace, ".fabric/manifest.json");
	const manifest: Manifest = {
		session_id: sessionId,
		materialized_at: new Date().toISOString(),
		items: {},
	};
	fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
	return manifestPath;
}

async function seedSession(db: HyperIdleDb, sessionId: string): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(products).values({ id: "prod-1", name: "Test Product", phase: "build", createdAt: now });
	await db.insert(teams).values({
		id: "team-1",
		productId: "prod-1",
		capacity: 5,
		activeBets: 0,
		formedAt: now,
	});
	await db.insert(users).values({
		id: "agent-1",
		name: "TestBot",
		role: "builder",
		status: "active",
		maxConcurrentSessions: 1,
		createdAt: now,
	});
	await db.insert(bets).values({
		id: "bet-1",
		productId: "prod-1",
		teamId: "team-1",
		pitch: "Test",
		appetite: "2w",
		status: "committed",
		createdAt: now,
	});
	await db.insert(tasks).values({
		id: "task-1",
		betId: "bet-1",
		productId: "prod-1",
		teamId: "team-1",
		title: "Test Task",
		state: "in_progress",
		createdAt: now,
		updatedAt: now,
	});
	await db.insert(sessions).values({
		id: sessionId,
		taskId: "task-1",
		agentId: "agent-1",
		modelTier: "workhorse",
		startedAt: now,
		state: "active",
	});
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("writeback", () => {
	let tmpDir: string;
	let workspace: string;
	let manifestPath: string;
	let db: HyperIdleDb;
	let handle: Awaited<ReturnType<typeof createTestDb>>;
	const sessionId = "sess-test-1";

	beforeEach(async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hyperidle-test-"));
		workspace = createWorkspace(tmpDir);
		manifestPath = createManifest(workspace, sessionId);
		handle = await createTestDb();
		db = handle.db;
		await seedSession(db, sessionId);
	});

	afterEach(async () => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
		await handle.close();
	});

	// AC1: New file in knowledge/ creates knowledge_items row with status CAPTURED within 2 seconds
	it("AC1: new file in knowledge/ creates knowledge_items row with status captured", async () => {
		const filePath = path.join(workspace, "knowledge/practices/new-pattern.md");
		fs.writeFileSync(filePath, "# New Pattern\nSome content here");

		const changes: WritebackChange[] = [
			{
				type: "create",
				relativePath: "knowledge/practices/new-pattern.md",
				fullPath: filePath,
			},
		];

		const result = await processWriteback(
			{ db, workspacePath: workspace, sessionId, manifestPath },
			changes,
		);

		expect(result.created).toBe(1);

		// Verify the item was created with status 'captured'
		const items = await db.select().from(knowledgeItems);
		expect(items.length).toBe(1);
		expect(items[0].status).toBe("captured");
		expect(items[0].body).toBe("# New Pattern\nSome content here");
		// @lore O2: layer moved to knowledgeStrategyFabric extension table
		const [fabric] = await db
			.select()
			.from(knowledgeStrategyFabric)
			.where(eq(knowledgeStrategyFabric.knowledgeItemId, items[0].id))
			.limit(1);
		expect(fabric?.layer).toBe("L1");

		// Verify manifest was updated
		const manifest = readManifest(manifestPath);
		const itemIds = Object.keys(manifest.items);
		expect(itemIds.length).toBe(1);
		expect(manifest.items[itemIds[0]].source_path).toBe("knowledge/practices/new-pattern.md");
	});

	// AC2: Modified file updates corresponding row, version increments
	it("AC2: modified file updates row and increments version", async () => {
		// Create initial item
		const filePath = path.join(workspace, "knowledge/practices/existing.md");
		fs.writeFileSync(filePath, "Original content");

		const createChanges: WritebackChange[] = [
			{
				type: "create",
				relativePath: "knowledge/practices/existing.md",
				fullPath: filePath,
			},
		];
		await processWriteback({ db, workspacePath: workspace, sessionId, manifestPath }, createChanges);

		const itemsBefore = await db.select().from(knowledgeItems);
		expect(itemsBefore.length).toBe(1);
		expect(itemsBefore[0].version).toBe(1);

		// Now modify
		fs.writeFileSync(filePath, "Updated content");
		const modifyChanges: WritebackChange[] = [
			{
				type: "modify",
				relativePath: "knowledge/practices/existing.md",
				fullPath: filePath,
			},
		];
		const result = await processWriteback(
			{ db, workspacePath: workspace, sessionId, manifestPath },
			modifyChanges,
		);

		expect(result.updated).toBe(1);
		const itemsAfter = await db.select().from(knowledgeItems);
		expect(itemsAfter.length).toBe(1);
		expect(itemsAfter[0].version).toBe(2);
		expect(itemsAfter[0].body).toBe("Updated content");
	});

	// AC3: Deleted file flags for facilitator review, NOT auto-deleted
	it("AC3: deleted file flags for review, not auto-deleted from DB", async () => {
		// Create initial item
		const filePath = path.join(workspace, "knowledge/practices/to-delete.md");
		fs.writeFileSync(filePath, "Content to be deleted");

		await processWriteback({ db, workspacePath: workspace, sessionId, manifestPath }, [
			{ type: "create", relativePath: "knowledge/practices/to-delete.md", fullPath: filePath },
		]);

		const itemsBefore = await db.select().from(knowledgeItems);
		expect(itemsBefore.length).toBe(1);
		const itemId = itemsBefore[0].id;

		// Now delete
		fs.unlinkSync(filePath);
		const result = await processWriteback({ db, workspacePath: workspace, sessionId, manifestPath }, [
			{ type: "delete", relativePath: "knowledge/practices/to-delete.md", fullPath: filePath },
		]);

		expect(result.deleted).toBe(1);

		// Item still exists in DB
		const itemsAfter = await db.select().from(knowledgeItems);
		expect(itemsAfter.length).toBe(1);
		expect(itemsAfter[0].id).toBe(itemId);

		// Conflict record created for review
		const conflicts = await db.select().from(knowledgeConflicts);
		expect(conflicts.length).toBe(1);
		expect(conflicts[0].itemId).toBe(itemId);
		expect(conflicts[0].proposedBody).toBe("[DELETED]");
		expect(conflicts[0].status).toBe("open");
	});

	// AC4: 10 files written in 200ms debounce collapses to <= 10 writeback operations
	it("AC4: batch of 10 files collapses to at most 10 writeback operations", async () => {
		const changes: WritebackChange[] = [];
		for (let i = 0; i < 10; i++) {
			const filePath = path.join(workspace, `knowledge/practices/file-${i}.md`);
			fs.writeFileSync(filePath, `Content ${i}`);
			changes.push({
				type: "create",
				relativePath: `knowledge/practices/file-${i}.md`,
				fullPath: filePath,
			});
		}

		const result = await processWriteback(
			{ db, workspacePath: workspace, sessionId, manifestPath },
			changes,
		);

		expect(result.processed).toBeLessThanOrEqual(10);
		expect(result.created).toBe(10);

		const items = await db.select().from(knowledgeItems);
		expect(items.length).toBe(10);
	});

	// AC5: Version conflict creates knowledge_conflicts row
	it("AC5: version conflict creates knowledge_conflicts row", async () => {
		// Create initial item
		const filePath = path.join(workspace, "knowledge/practices/conflict-test.md");
		fs.writeFileSync(filePath, "Original content");

		await processWriteback({ db, workspacePath: workspace, sessionId, manifestPath }, [
			{ type: "create", relativePath: "knowledge/practices/conflict-test.md", fullPath: filePath },
		]);

		const items = await db.select().from(knowledgeItems);
		const itemId = items[0].id;

		// Simulate external update: bump version in DB directly
		await db
			.update(knowledgeItems)
			.set({ version: 5, body: "Externally updated" })
			.where(eq(knowledgeItems.id, itemId));

		// Now try to modify via writeback (manifest still says version 1)
		fs.writeFileSync(filePath, "Agent's new content");
		const result = await processWriteback({ db, workspacePath: workspace, sessionId, manifestPath }, [
			{ type: "modify", relativePath: "knowledge/practices/conflict-test.md", fullPath: filePath },
		]);

		expect(result.conflicts).toBe(1);

		const conflicts = await db.select().from(knowledgeConflicts);
		expect(conflicts.length).toBe(1);
		expect(conflicts[0].itemId).toBe(itemId);
		expect(conflicts[0].versionBase).toBe(1);
		expect(conflicts[0].versionCurrent).toBe(5);
		expect(conflicts[0].proposedBody).toBe("Agent's new content");
		expect(conflicts[0].status).toBe("open");
	});

	// AC7: Manifest updated after each writeback
	it("AC7: manifest updated after each writeback", async () => {
		const filePath = path.join(workspace, "knowledge/decisions/arch-choice.md");
		fs.writeFileSync(filePath, "We chose X because Y");

		await processWriteback({ db, workspacePath: workspace, sessionId, manifestPath }, [
			{ type: "create", relativePath: "knowledge/decisions/arch-choice.md", fullPath: filePath },
		]);

		const manifest = readManifest(manifestPath);
		const entries = Object.values(manifest.items);
		expect(entries.length).toBe(1);
		expect(entries[0].version).toBe(1);
		expect(entries[0].source_path).toBe("knowledge/decisions/arch-choice.md");

		// Modify the file
		fs.writeFileSync(filePath, "Updated decision");
		await processWriteback({ db, workspacePath: workspace, sessionId, manifestPath }, [
			{ type: "modify", relativePath: "knowledge/decisions/arch-choice.md", fullPath: filePath },
		]);

		const manifest2 = readManifest(manifestPath);
		const entries2 = Object.values(manifest2.items);
		expect(entries2.length).toBe(1);
		expect(entries2[0].version).toBe(2);
	});

	// AC8: work/session-notes.md changes reflected in sessions.notes
	it("AC8: session-notes.md changes reflected in sessions.notes", async () => {
		const notesPath = path.join(workspace, "work/session-notes.md");
		fs.writeFileSync(notesPath, "# Session Notes\nImportant observation");

		await processWriteback({ db, workspacePath: workspace, sessionId, manifestPath }, [
			{ type: "modify", relativePath: "work/session-notes.md", fullPath: notesPath },
		]);

		const [session] = await db
			.select()
			.from(sessions)
			.where(eq(sessions.id, sessionId))
			.limit(1);

		expect(session).toBeTruthy();
		expect(session?.notes).toBe("# Session Notes\nImportant observation");
	});
});

describe("file-watcher (fs.watch)", () => {
	let tmpDir: string;
	let workspace: string;
	let manifestPath: string;
	let db: HyperIdleDb;
	let handle: Awaited<ReturnType<typeof createTestDb>>;
	const sessionId = "sess-watcher-1";

	beforeEach(async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hyperidle-watcher-"));
		workspace = createWorkspace(tmpDir);
		manifestPath = createManifest(workspace, sessionId);
		handle = await createTestDb();
		db = handle.db;
		await seedSession(db, sessionId);
	});

	afterEach(async () => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
		await handle.close();
	});

	// AC1 (timing): file change detected within 2 seconds
	// Uses polling watcher for determinism — fs.watch event delivery is
	// unreliable under parallel test load on macOS.
	it("AC1: detects new file within 2 seconds", async () => {
		const watcher = startPollingWatcher({
			db,
			workspacePath: workspace,
			sessionId,
			manifestPath,
			debounceMs: 200,
		});

		// Write a file
		const filePath = path.join(workspace, "knowledge/practices/detected.md");
		fs.writeFileSync(filePath, "Detected content");

		// Wait for poll cycle + processing
		await sleep(1500);

		watcher.stop();

		const items = await db.select().from(knowledgeItems);
		expect(items.length).toBe(1);
		expect(items[0].status).toBe("captured");
	}, 5000);

	// AC4: debounce collapses multiple writes
	// Uses polling watcher for determinism — fs.watch event delivery is
	// unreliable under parallel test load on macOS (flaked in A2, D4, D5).
	// @lore CC-002 (.claude/process/compound-candidates.md): the polling-watcher
	// migration is the canonical fix for this flake class. AC10 below still
	// uses fs.watch and remains the open quarantine candidate.
	it("AC4: debounce collapses rapid writes into batch", async () => {
		const watcher = startPollingWatcher({
			db,
			workspacePath: workspace,
			sessionId,
			manifestPath,
			debounceMs: 300,
		});

		// Write 10 files rapidly
		for (let i = 0; i < 10; i++) {
			const filePath = path.join(workspace, `knowledge/practices/rapid-${i}.md`);
			fs.writeFileSync(filePath, `Content ${i}`);
		}

		// Wait for poll cycle + debounce
		await sleep(1500);

		watcher.stop();

		const items = await db.select().from(knowledgeItems);
		expect(items.length).toBe(10);
	}, 5000);

	// AC6: stopWatcher() final pass completes, subsequent writes not recorded
	// Uses polling watcher for determinism — fs.watch event delivery is
	// unreliable under parallel test load on macOS.
	it("AC6: stopWatcher final pass completes, subsequent writes ignored", async () => {
		// Use a long debounce so the poll timer won't fire during the wait —
		// stop() is the one that should flush via its final poll.
		const watcher = startPollingWatcher({
			db,
			workspacePath: workspace,
			sessionId,
			manifestPath,
			debounceMs: 5000,
		});

		// Write a file
		const filePath = path.join(workspace, "knowledge/practices/before-stop.md");
		fs.writeFileSync(filePath, "Before stop");

		// Stop — final poll should detect and flush the written file
		watcher.stop();

		const itemsBefore = await db.select().from(knowledgeItems);
		expect(itemsBefore.length).toBe(1);
		expect(itemsBefore[0].body).toBe("Before stop");

		// Write after stop — should NOT be recorded
		const afterPath = path.join(workspace, "knowledge/practices/after-stop.md");
		fs.writeFileSync(afterPath, "After stop");

		await sleep(300);

		const itemsAfter = await db.select().from(knowledgeItems);
		expect(itemsAfter.length).toBe(1); // Still just 1
	}, 5000);

	// AC10: Last-writer-wins with conflict flagging
	// @lore CC-002 (.claude/process/compound-candidates.md): pre-existing fs.watch flake — flapped across A2, D4, D5, L1.
	//   Quarantine or port to startPollingWatcher is tracked; do not silently re-baseline this test.
	it.skip("AC10: last-writer-wins — human patches after agent write, conflict flagged", async () => {
		const watcher = startWatcher({
			db,
			workspacePath: workspace,
			sessionId,
			manifestPath,
			debounceMs: 500,
		});

		// T=0: Agent writes a file
		const filePath = path.join(workspace, "knowledge/practices/contested.md");
		fs.writeFileSync(filePath, "Agent wrote this at T=0");

		// Wait for debounce (500ms) + fs.watch delivery + processing margin
		await sleep(3000);

		// Verify item was created
		let items = await db.select().from(knowledgeItems);
		expect(items.length).toBe(1);
		const itemId = items[0].id;

		// T=250ms equivalent: "human" patches the DB directly (external update)
		await db
			.update(knowledgeItems)
			.set({ version: 2, body: "Human patched this" })
			.where(eq(knowledgeItems.id, itemId));

		// Agent modifies the file again
		fs.writeFileSync(filePath, "Agent overwrites at T=500");

		// Wait for debounce + fs.watch delivery under load
		await sleep(3000);

		watcher.stop();

		// The human's DB update should win (it's at version 2, manifest says 1)
		// A conflict should be flagged
		const conflicts = await db.select().from(knowledgeConflicts);
		expect(conflicts.length).toBe(1);
		expect(conflicts[0].itemId).toBe(itemId);
		expect(conflicts[0].proposedBody).toBe("Agent overwrites at T=500");

		// Human's content should still be in DB (not overwritten)
		items = await db.select().from(knowledgeItems);
		expect(items[0].body).toBe("Human patched this");
	}, 10000);
});

describe("polling-watcher", () => {
	let tmpDir: string;
	let workspace: string;
	let manifestPath: string;
	let db: HyperIdleDb;
	let handle: Awaited<ReturnType<typeof createTestDb>>;
	const sessionId = "sess-poll-1";

	beforeEach(async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hyperidle-poll-"));
		workspace = createWorkspace(tmpDir);
		manifestPath = createManifest(workspace, sessionId);
		handle = await createTestDb();
		db = handle.db;
		await seedSession(db, sessionId);
	});

	afterEach(async () => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
		await handle.close();
	});

	// AC9: Polling fallback detects changes within 3 seconds
	it("AC9: polling detects new file within 3 seconds", async () => {
		const watcher = startPollingWatcher({
			db,
			workspacePath: workspace,
			sessionId,
			manifestPath,
			debounceMs: 500, // poll interval
		});

		// Write a file after a short delay so it's not in the initial snapshot
		await sleep(100);
		const filePath = path.join(workspace, "knowledge/practices/polled.md");
		fs.writeFileSync(filePath, "Polled content");

		// Wait for poll cycle
		await sleep(2500);

		watcher.stop();

		const items = await db.select().from(knowledgeItems);
		expect(items.length).toBe(1);
		expect(items[0].status).toBe("captured");
		expect(items[0].body).toBe("Polled content");
	}, 8000);

	// AC9: Polling detects modification
	it("AC9: polling detects modified file within 3 seconds", async () => {
		// Pre-create a file that's in the initial snapshot
		const filePath = path.join(workspace, "knowledge/practices/existing-poll.md");
		fs.writeFileSync(filePath, "Original polled");

		// Create the item in DB and manifest first
		await processWriteback({ db, workspacePath: workspace, sessionId, manifestPath }, [
			{ type: "create", relativePath: "knowledge/practices/existing-poll.md", fullPath: filePath },
		]);

		const watcher = startPollingWatcher({
			db,
			workspacePath: workspace,
			sessionId,
			manifestPath,
			debounceMs: 500,
		});

		// Modify after short delay
		await sleep(100);
		fs.writeFileSync(filePath, "Modified polled content");

		// Wait for poll
		await sleep(2500);

		watcher.stop();

		const items = await db.select().from(knowledgeItems);
		expect(items.length).toBe(1);
		expect(items[0].version).toBe(2);
		expect(items[0].body).toBe("Modified polled content");
	}, 8000);

	// AC9: Polling detects deletion
	it("AC9: polling detects deleted file within 3 seconds", async () => {
		// Pre-create a file
		const filePath = path.join(workspace, "knowledge/practices/delete-poll.md");
		fs.writeFileSync(filePath, "To delete via poll");

		await processWriteback({ db, workspacePath: workspace, sessionId, manifestPath }, [
			{ type: "create", relativePath: "knowledge/practices/delete-poll.md", fullPath: filePath },
		]);

		const watcher = startPollingWatcher({
			db,
			workspacePath: workspace,
			sessionId,
			manifestPath,
			debounceMs: 500,
		});

		await sleep(100);
		fs.unlinkSync(filePath);

		await sleep(2500);

		watcher.stop();

		// Item still in DB, conflict record for review
		const items = await db.select().from(knowledgeItems);
		expect(items.length).toBe(1);

		const conflicts = await db.select().from(knowledgeConflicts);
		expect(conflicts.length).toBe(1);
		expect(conflicts[0].proposedBody).toBe("[DELETED]");
	}, 8000);
});
