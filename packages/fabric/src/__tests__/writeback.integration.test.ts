import * as fs from "node:fs";
import * as path from "node:path";
import {
	bets,
	createTestDb,
	type HyperIdleDb,
	knowledgeConflicts,
	knowledgeItems,
	knowledgeStrategyFabric,
	sessions,
	tasks,
	teamMembers,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Manifest } from "../materialization.js";
import {
	getRelativePath,
	isKnowledgePath,
	isSessionNotesPath,
	isWatchedPath,
	processWriteback,
	readManifest,
	type WritebackChange,
	type WritebackConfig,
	writeManifest,
} from "../writeback.js";

function createWorkspace(tmpDir: string): string {
	const workspace = path.join(tmpDir, "workspace");
	fs.mkdirSync(path.join(workspace, ".fabric"), { recursive: true });
	fs.mkdirSync(path.join(workspace, "knowledge/practices"), { recursive: true });
	fs.mkdirSync(path.join(workspace, "knowledge/decisions"), { recursive: true });
	fs.mkdirSync(path.join(workspace, "knowledge/failures"), { recursive: true });
	fs.mkdirSync(path.join(workspace, "work"), { recursive: true });
	fs.mkdirSync(path.join(workspace, "context"), { recursive: true });
	return workspace;
}

function writeTestManifest(workspace: string, manifest: Manifest): void {
	writeManifest(path.join(workspace, ".fabric/manifest.json"), manifest);
}

async function setupSessionData(db: HyperIdleDb): Promise<{
	sessionId: string;
	agentId: string;
	taskId: string;
}> {
	const now = new Date().toISOString();
	const productId = "test-product";
	const teamId = "test-team";
	const agentId = "test-agent";
	const betId = "test-bet";
	const taskId = "test-task";
	const threadId = "test-thread";
	const sessionId = "test-session";

	// @lore U1: teams is the domain entity; teamMembers is the membership group.
	await db.insert(teams).values({ id: productId, name: "Test", phase: "build", createdAt: now });
	await db
		.insert(teamMembers)
		.values({ id: teamId, teamId: productId, capacity: 5, formedAt: now });

	await db.insert(users).values({
		id: agentId,
		name: "Test Agent",
		role: "builder",
		status: "active",
		createdAt: now,
		teamId,
	});

	await db.insert(threads).values({
		id: threadId,
		hostKind: "task",
		hostId: "task-1",
		initiatorId: "agent-1",
		participants: JSON.stringify(["agent-1"]),
		lastActiveAt: now,
		createdAt: now,
	});

	// @lore U1: bets.teamId references `teams` (domain entity); description replaces pitch.
	await db.insert(bets).values({
		id: betId,
		teamId: productId,
		description: "test",
		appetite: "1w",
		status: "active",
		createdAt: now,
	});

	await db.insert(tasks).values({
		id: taskId,
		betId,
		// @lore U1: tasks.teamId references `teams` (domain entity); productId removed.
		teamId: productId,
		title: "Test Task",
		state: "active",
		threadId,
		createdAt: now,
		updatedAt: now,
	});

	await db.insert(sessions).values({
		id: sessionId,
		taskId,
		agentId,
		modelTier: "standard",
		startedAt: now,
		state: "active",
	});

	return { sessionId, agentId, taskId };
}

describe("writeback utilities", () => {
	it("getRelativePath returns relative path", async () => {
		expect(getRelativePath("/workspace", "/workspace/knowledge/foo.md")).toBe("knowledge/foo.md");
	});

	it("isKnowledgePath detects knowledge paths", async () => {
		expect(isKnowledgePath("knowledge/foo.md")).toBe(true);
		expect(isKnowledgePath("work/foo.md")).toBe(false);
		expect(isKnowledgePath("context/foo.md")).toBe(false);
	});

	it("isSessionNotesPath detects session notes", async () => {
		expect(isSessionNotesPath("work/session-notes.md")).toBe(true);
		expect(isSessionNotesPath("work/task-notes.md")).toBe(true);
		expect(isSessionNotesPath("work/other.md")).toBe(false);
	});

	it("isWatchedPath detects watched paths", async () => {
		expect(isWatchedPath("knowledge/foo.md")).toBe(true);
		expect(isWatchedPath("work/bar.md")).toBe(true);
		expect(isWatchedPath("context/foo.md")).toBe(false);
		expect(isWatchedPath(".fabric/manifest.json")).toBe(false);
	});
});

describe("processWriteback", () => {
	let tmpDir: string;
	let workspace: string;
	let db: HyperIdleDb;
	let handle: Awaited<ReturnType<typeof createTestDb>>;
	let sessionData: Awaited<ReturnType<typeof setupSessionData>>;

	beforeEach(async () => {
		tmpDir = fs.mkdtempSync(path.join("/tmp", "writeback-test-"));
		workspace = createWorkspace(tmpDir);
		handle = await createTestDb();
		db = handle.db;
		sessionData = await setupSessionData(db);
	});

	afterEach(async () => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
		await handle.close();
	});

	function makeConfig(): WritebackConfig {
		return {
			db,
			workspacePath: workspace,
			sessionId: sessionData.sessionId,
			manifestPath: path.join(workspace, ".fabric/manifest.json"),
		};
	}

	// AC1: New file in knowledge/ creates knowledge_items row with status CAPTURED
	it("AC1: new file creates knowledge_items row with status captured", async () => {
		const manifest: Manifest = {
			session_id: sessionData.sessionId,
			materialized_at: new Date().toISOString(),
			items: {},
		};
		writeTestManifest(workspace, manifest);

		// Write a new file
		const filePath = path.join(workspace, "knowledge/practices/my-pattern.md");
		fs.writeFileSync(filePath, "# My Pattern\nSome content here");

		const result = await processWriteback(makeConfig(), [
			{
				type: "create",
				relativePath: "knowledge/practices/my-pattern.md",
				fullPath: filePath,
			},
		]);

		expect(result.created).toBe(1);

		// Verify row was created
		const items = await db.select().from(knowledgeItems);
		expect(items).toHaveLength(1);
		expect(items[0].status).toBe("captured");
		expect(items[0].body).toBe("# My Pattern\nSome content here");
		expect(items[0].version).toBe(1);
		// @lore O2: layer moved to knowledgeStrategyFabric extension table
		const [fabric] = await db
			.select()
			.from(knowledgeStrategyFabric)
			.where(eq(knowledgeStrategyFabric.knowledgeItemId, items[0].id))
			.limit(1);
		expect(fabric?.layer).toBe("L1");
	});

	// AC2: Modified file updates corresponding row, version increments
	it("AC2: modified file updates row and increments version", async () => {
		// Pre-create a knowledge item
		const itemId = "existing-item-1";
		const now = new Date().toISOString();
		// @lore O2: kernel table no longer has layer/kind; those go to knowledgeStrategyFabric
		await db.insert(knowledgeItems).values({
			id: itemId,
			title: "existing pattern",
			body: "original body",
			format: "markdown",
			status: "captured",
			version: 1,
			updatedBy: "test",
			createdAt: now,
			updatedAt: now,
		});
		await db.insert(knowledgeStrategyFabric).values({
			id: `ksf-${itemId}`,
			knowledgeItemId: itemId,
			layer: "L1",
			kind: "pattern",
		});

		const manifest: Manifest = {
			session_id: sessionData.sessionId,
			materialized_at: now,
			items: {
				[itemId]: {
					version: 1,
					source_path: "knowledge/practices/existing-pattern.md",
					format: "markdown",
				},
			},
		};
		writeTestManifest(workspace, manifest);

		// Write modified content
		const filePath = path.join(workspace, "knowledge/practices/existing-pattern.md");
		fs.writeFileSync(filePath, "updated body content");

		const result = await processWriteback(makeConfig(), [
			{
				type: "modify",
				relativePath: "knowledge/practices/existing-pattern.md",
				fullPath: filePath,
			},
		]);

		expect(result.updated).toBe(1);

		const [item] = await db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, itemId))
			.limit(1);
		expect(item).toBeDefined();
		expect(item?.body).toBe("updated body content");
		expect(item?.version).toBe(2);
	});

	// AC3: Deleted file flags for facilitator review, NOT auto-deleted
	it("AC3: deleted file flags for review, not auto-deleted", async () => {
		const itemId = "delete-item-1";
		const now = new Date().toISOString();
		// @lore O2: kernel table no longer has layer/kind; those go to knowledgeStrategyFabric
		await db.insert(knowledgeItems).values({
			id: itemId,
			title: "to be deleted",
			body: "some body",
			format: "markdown",
			status: "captured",
			version: 1,
			updatedBy: "test",
			createdAt: now,
			updatedAt: now,
		});
		await db.insert(knowledgeStrategyFabric).values({
			id: `ksf-${itemId}`,
			knowledgeItemId: itemId,
			layer: "L1",
			kind: "pattern",
		});

		const manifest: Manifest = {
			session_id: sessionData.sessionId,
			materialized_at: now,
			items: {
				[itemId]: {
					version: 1,
					source_path: "knowledge/practices/to-be-deleted.md",
					format: "markdown",
				},
			},
		};
		writeTestManifest(workspace, manifest);

		const result = await processWriteback(makeConfig(), [
			{
				type: "delete",
				relativePath: "knowledge/practices/to-be-deleted.md",
				fullPath: path.join(workspace, "knowledge/practices/to-be-deleted.md"),
			},
		]);

		expect(result.deleted).toBe(1);

		// Item still exists in DB (not auto-deleted)
		const [item] = await db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, itemId))
			.limit(1);
		expect(item).toBeDefined();

		// A conflict/review item was created
		const conflicts = await db.select().from(knowledgeConflicts);
		expect(conflicts).toHaveLength(1);
		expect(conflicts[0].itemId).toBe(itemId);
		expect(conflicts[0].proposedBody).toBe("[DELETED]");
		expect(conflicts[0].status).toBe("open");
	});

	// AC5: Version conflict creates knowledge_conflicts row
	it("AC5: version conflict creates knowledge_conflicts row", async () => {
		const itemId = "conflict-item-1";
		const now = new Date().toISOString();
		// @lore O2: kernel table no longer has layer/kind; those go to knowledgeStrategyFabric
		await db.insert(knowledgeItems).values({
			id: itemId,
			title: "conflict item",
			body: "original body",
			format: "markdown",
			status: "captured",
			version: 3, // DB has version 3
			updatedBy: "external-editor",
			createdAt: now,
			updatedAt: now,
		});
		await db.insert(knowledgeStrategyFabric).values({
			id: `ksf-${itemId}`,
			knowledgeItemId: itemId,
			layer: "L1",
			kind: "pattern",
		});

		// Manifest thinks version is 1 (stale)
		const manifest: Manifest = {
			session_id: sessionData.sessionId,
			materialized_at: now,
			items: {
				[itemId]: {
					version: 1,
					source_path: "knowledge/practices/conflict-item.md",
					format: "markdown",
				},
			},
		};
		writeTestManifest(workspace, manifest);

		const filePath = path.join(workspace, "knowledge/practices/conflict-item.md");
		fs.writeFileSync(filePath, "agent's proposed content");

		const result = await processWriteback(makeConfig(), [
			{
				type: "modify",
				relativePath: "knowledge/practices/conflict-item.md",
				fullPath: filePath,
			},
		]);

		expect(result.conflicts).toBe(1);

		const conflicts = await db.select().from(knowledgeConflicts);
		expect(conflicts).toHaveLength(1);
		expect(conflicts[0].itemId).toBe(itemId);
		expect(conflicts[0].versionBase).toBe(1);
		expect(conflicts[0].versionCurrent).toBe(3);
		expect(conflicts[0].proposedBody).toBe("agent's proposed content");
		expect(conflicts[0].status).toBe("open");
	});

	// AC7: Manifest updated after each writeback
	it("AC7: manifest updated after each writeback", async () => {
		const manifest: Manifest = {
			session_id: sessionData.sessionId,
			materialized_at: new Date().toISOString(),
			items: {},
		};
		writeTestManifest(workspace, manifest);

		const filePath = path.join(workspace, "knowledge/practices/new-item.md");
		fs.writeFileSync(filePath, "content");

		await processWriteback(makeConfig(), [
			{
				type: "create",
				relativePath: "knowledge/practices/new-item.md",
				fullPath: filePath,
			},
		]);

		// Read back the manifest
		const updatedManifest = readManifest(path.join(workspace, ".fabric/manifest.json"));
		const itemIds = Object.keys(updatedManifest.items);
		expect(itemIds).toHaveLength(1);
		expect(updatedManifest.items[itemIds[0]].source_path).toBe("knowledge/practices/new-item.md");
		expect(updatedManifest.items[itemIds[0]].version).toBe(1);
	});

	// AC8: work/session-notes.md changes reflected in sessions.notes
	it("AC8: session-notes.md changes reflected in sessions.notes", async () => {
		const manifest: Manifest = {
			session_id: sessionData.sessionId,
			materialized_at: new Date().toISOString(),
			items: {},
		};
		writeTestManifest(workspace, manifest);

		const notesPath = path.join(workspace, "work/session-notes.md");
		fs.writeFileSync(notesPath, "# Session Notes\nImportant finding here.");

		await processWriteback(makeConfig(), [
			{
				type: "modify",
				relativePath: "work/session-notes.md",
				fullPath: notesPath,
			},
		]);

		const [session] = await db
			.select()
			.from(sessions)
			.where(eq(sessions.id, sessionData.sessionId))
			.limit(1);
		expect(session).toBeDefined();
		expect(session?.notes).toBe("# Session Notes\nImportant finding here.");
	});

	// AC10: Last-writer-wins with conflict flagged
	it("AC10: last-writer-wins scenario flags conflict", async () => {
		const itemId = "lww-item-1";
		const now = new Date().toISOString();

		// Agent write at T=0: create item with version 1
		// @lore O2: kernel table no longer has layer/kind; those go to knowledgeStrategyFabric
		await db.insert(knowledgeItems).values({
			id: itemId,
			title: "lww item",
			body: "agent original",
			format: "markdown",
			status: "captured",
			version: 1,
			updatedBy: "agent",
			createdAt: now,
			updatedAt: now,
		});
		await db.insert(knowledgeStrategyFabric).values({
			id: `ksf-${itemId}`,
			knowledgeItemId: itemId,
			layer: "L1",
			kind: "pattern",
		});

		// Manifest tracks version 1
		const manifest: Manifest = {
			session_id: sessionData.sessionId,
			materialized_at: now,
			items: {
				[itemId]: {
					version: 1,
					source_path: "knowledge/practices/lww-item.md",
					format: "markdown",
				},
			},
		};
		writeTestManifest(workspace, manifest);

		// Human patches at T=250ms (simulated): DB version bumped to 2
		await db
			.update(knowledgeItems)
			.set({ body: "human patched", version: 2, updatedBy: "human" })
			.where(eq(knowledgeItems.id, itemId));

		// Now agent's file change comes in with its version still at 1
		const filePath = path.join(workspace, "knowledge/practices/lww-item.md");
		fs.writeFileSync(filePath, "agent updated content");

		const result = await processWriteback(makeConfig(), [
			{
				type: "modify",
				relativePath: "knowledge/practices/lww-item.md",
				fullPath: filePath,
			},
		]);

		// Should detect conflict (manifest version 1, DB version 2)
		expect(result.conflicts).toBe(1);

		// Human change wins (still version 2 in DB)
		const [item] = await db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, itemId))
			.limit(1);
		expect(item?.body).toBe("human patched");
		expect(item?.version).toBe(2);

		// Conflict was flagged
		const conflicts = await db.select().from(knowledgeConflicts);
		expect(conflicts).toHaveLength(1);
		expect(conflicts[0].proposedBody).toBe("agent updated content");
	});

	it("modify on unknown file treats as create", async () => {
		const manifest: Manifest = {
			session_id: sessionData.sessionId,
			materialized_at: new Date().toISOString(),
			items: {},
		};
		writeTestManifest(workspace, manifest);

		const filePath = path.join(workspace, "knowledge/practices/unknown.md");
		fs.writeFileSync(filePath, "new content");

		const result = await processWriteback(makeConfig(), [
			{
				type: "modify",
				relativePath: "knowledge/practices/unknown.md",
				fullPath: filePath,
			},
		]);

		// Treated as create since not in manifest
		expect(result.created).toBe(1);

		const items = await db.select().from(knowledgeItems);
		expect(items).toHaveLength(1);
	});

	it("delete on unknown file is a no-op", async () => {
		const manifest: Manifest = {
			session_id: sessionData.sessionId,
			materialized_at: new Date().toISOString(),
			items: {},
		};
		writeTestManifest(workspace, manifest);

		const result = await processWriteback(makeConfig(), [
			{
				type: "delete",
				relativePath: "knowledge/practices/nonexistent.md",
				fullPath: path.join(workspace, "knowledge/practices/nonexistent.md"),
			},
		]);

		expect(result.deleted).toBe(0);
	});

	it("non-knowledge paths are skipped", async () => {
		const manifest: Manifest = {
			session_id: sessionData.sessionId,
			materialized_at: new Date().toISOString(),
			items: {},
		};
		writeTestManifest(workspace, manifest);

		const filePath = path.join(workspace, "context/something.md");
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		fs.writeFileSync(filePath, "content");

		const result = await processWriteback(makeConfig(), [
			{
				type: "create",
				relativePath: "context/something.md",
				fullPath: filePath,
			},
		]);

		expect(result.created).toBe(0);
		const items = await db.select().from(knowledgeItems);
		expect(items).toHaveLength(0);
	});

	it("processes batch of multiple changes", async () => {
		const manifest: Manifest = {
			session_id: sessionData.sessionId,
			materialized_at: new Date().toISOString(),
			items: {},
		};
		writeTestManifest(workspace, manifest);

		// Create multiple files
		for (let i = 0; i < 5; i++) {
			const fp = path.join(workspace, `knowledge/practices/file-${i}.md`);
			fs.writeFileSync(fp, `Content ${i}`);
		}

		const changes: WritebackChange[] = [];
		for (let i = 0; i < 5; i++) {
			changes.push({
				type: "create",
				relativePath: `knowledge/practices/file-${i}.md`,
				fullPath: path.join(workspace, `knowledge/practices/file-${i}.md`),
			});
		}

		const result = await processWriteback(makeConfig(), changes);
		expect(result.created).toBe(5);

		const items = await db.select().from(knowledgeItems);
		expect(items).toHaveLength(5);
	});
});
