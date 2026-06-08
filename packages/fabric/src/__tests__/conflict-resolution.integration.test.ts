import { createTestDb, type HyperIdleDb, knowledgeConflicts } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { eq } from "drizzle-orm";
import {
	type ConcurrentEdit,
	canPromote,
	mergeStructuredEdits,
	promote,
	resolveConflict,
	resolveConflictRecord,
} from "../conflict-resolution.js";
import { setupFts } from "../fts.js";
import { create, getById } from "../knowledge-repository.js";

const structuredBase = {
	layer: "L1" as const,
	scopeId: "product-1",
	kind: "pattern" as const,
	topic: "testing",
	title: "Test Pattern",
	body: "Original body content",
	format: "markdown" as const,
	status: "captured" as const,
	updatedBy: "agent-1",
	meta: JSON.stringify({ tags: ["test"], evidence: "some evidence" }),
};

const proseBase = {
	...structuredBase,
	kind: "reflection" as const,
	title: "Test Reflection",
	body: "Original reflection text",
	meta: null,
};

describe("conflict-resolution", () => {
	describe("AC1: structured item, different fields", () => {
		test("applies both edits with no conflict record", async ({ db }) => {
			await setupFts(db);
			const item = await create(db, structuredBase);

			const edits: ConcurrentEdit[] = [
				{
					changes: { title: "Updated Title" },
					version: item.version,
					editor: "agent-A",
					timestamp: "2026-04-15T10:00:00.000Z",
				},
				{
					changes: { body: "Updated Body" },
					version: item.version,
					editor: "agent-B",
					timestamp: "2026-04-15T10:01:00.000Z",
				},
			];

			const result = await resolveConflict(db, item.id, edits);
			expect(result.merged).toBe(true);
			expect(result.conflicts).toHaveLength(0);

			const updated = await getById(db, item.id);
			expect(updated?.title).toBe("Updated Title");
			expect(updated?.body).toBe("Updated Body");

			const conflicts = await db
				.select()
				.from(knowledgeConflicts)
				.where(eq(knowledgeConflicts.itemId, item.id));
			expect(conflicts).toHaveLength(0);
		});

		test("applies different meta fields without conflict", async ({ db }) => {
			await setupFts(db);
			const item = await create(db, {
				...structuredBase,
				meta: JSON.stringify({ tags: ["old"], evidence: "old evidence" }),
			});

			const edits: ConcurrentEdit[] = [
				{
					changes: { title: "New Title" },
					version: item.version,
					editor: "agent-A",
					timestamp: "2026-04-15T10:00:00.000Z",
				},
				{
					changes: { topic: "new-topic" },
					version: item.version,
					editor: "agent-B",
					timestamp: "2026-04-15T10:01:00.000Z",
				},
			];

			const result = await resolveConflict(db, item.id, edits);
			expect(result.merged).toBe(true);
			expect(result.conflicts).toHaveLength(0);

			const updated = await getById(db, item.id);
			expect(updated?.title).toBe("New Title");
			expect(updated?.topic).toBe("new-topic");
		});
	});

	describe("AC2: structured item, same field", () => {
		test("last writer wins for same field with conflict record", async ({ db }) => {
			await setupFts(db);
			const item = await create(db, structuredBase);

			const edits: ConcurrentEdit[] = [
				{
					changes: { title: "Title from A" },
					version: item.version,
					editor: "agent-A",
					timestamp: "2026-04-15T10:00:00.000Z",
				},
				{
					changes: { title: "Title from B" },
					version: item.version,
					editor: "agent-B",
					timestamp: "2026-04-15T10:01:00.000Z",
				},
			];

			const result = await resolveConflict(db, item.id, edits);
			expect(result.merged).toBe(true);
			expect(result.conflicts).toHaveLength(1);
			expect(result.conflicts[0]?.field).toBe("title");

			const updated = await getById(db, item.id);
			expect(updated?.title).toBe("Title from B");

			const conflicts = await db
				.select()
				.from(knowledgeConflicts)
				.where(eq(knowledgeConflicts.itemId, item.id));
			expect(conflicts).toHaveLength(1);
			expect(conflicts[0]?.status).toBe("resolved");
			expect(conflicts[0]?.proposedBy).toBe("agent-A");
			expect(conflicts[0]?.proposedBody).toContain("Title from A");
		});

		test("handles mix of conflicting and non-conflicting fields", async ({ db }) => {
			await setupFts(db);
			const item = await create(db, structuredBase);

			const edits: ConcurrentEdit[] = [
				{
					changes: { title: "Title from A", topic: "topic-A" },
					version: item.version,
					editor: "agent-A",
					timestamp: "2026-04-15T10:00:00.000Z",
				},
				{
					changes: { title: "Title from B", body: "Body from B" },
					version: item.version,
					editor: "agent-B",
					timestamp: "2026-04-15T10:01:00.000Z",
				},
			];

			const result = await resolveConflict(db, item.id, edits);
			expect(result.merged).toBe(true);
			expect(result.conflicts).toHaveLength(1);

			const updated = await getById(db, item.id);
			expect(updated?.title).toBe("Title from B");
			expect(updated?.topic).toBe("topic-A");
			expect(updated?.body).toBe("Body from B");
		});
	});

	describe("AC3: prose item conflicts", () => {
		test("creates open conflict record and keeps older version active", async ({ db }) => {
			await setupFts(db);
			const item = await create(db, proseBase);

			const edits: ConcurrentEdit[] = [
				{
					changes: { body: "Reflection version A" },
					version: item.version,
					editor: "agent-A",
					timestamp: "2026-04-15T10:00:00.000Z",
				},
				{
					changes: { body: "Reflection version B" },
					version: item.version,
					editor: "agent-B",
					timestamp: "2026-04-15T10:01:00.000Z",
				},
			];

			const result = await resolveConflict(db, item.id, edits);
			expect(result.merged).toBe(false);
			expect(result.conflicts).toHaveLength(1);

			const updated = await getById(db, item.id);
			expect(updated?.body).toBe("Reflection version A");

			const conflicts = await db
				.select()
				.from(knowledgeConflicts)
				.where(eq(knowledgeConflicts.itemId, item.id));
			expect(conflicts).toHaveLength(1);
			expect(conflicts[0]?.status).toBe("open");
			expect(conflicts[0]?.proposedBody).toBe("Reflection version B");
			expect(conflicts[0]?.proposedBy).toBe("agent-B");
		});

		test("handles prose kinds: brief, principle, focus", async () => {
			for (const kind of ["brief", "principle", "focus"] as const) {
				const localHandle = await createTestDb();
				const localDb = localHandle.db;
				await setupFts(localDb);
				const item = await create(localDb, { ...proseBase, kind });

				const edits: ConcurrentEdit[] = [
					{
						changes: { body: "Version A" },
						version: item.version,
						editor: "agent-A",
						timestamp: "2026-04-15T10:00:00.000Z",
					},
					{
						changes: { body: "Version B" },
						version: item.version,
						editor: "agent-B",
						timestamp: "2026-04-15T10:01:00.000Z",
					},
				];

				const result = await resolveConflict(localDb, item.id, edits);
				expect(result.merged).toBe(false);

				const conflicts = await localDb
					.select()
					.from(knowledgeConflicts)
					.where(eq(knowledgeConflicts.itemId, item.id));
				expect(conflicts).toHaveLength(1);
				expect(conflicts[0]?.status).toBe("open");

				await localHandle.close();
			}
		});
	});

	describe("AC4: conflict record fields", () => {
		test("has all required fields for structured conflict", async ({ db }) => {
			await setupFts(db);
			const item = await create(db, structuredBase);

			const edits: ConcurrentEdit[] = [
				{
					changes: { title: "A title" },
					version: item.version,
					editor: "agent-A",
					timestamp: "2026-04-15T10:00:00.000Z",
				},
				{
					changes: { title: "B title" },
					version: item.version,
					editor: "agent-B",
					timestamp: "2026-04-15T10:01:00.000Z",
				},
			];

			await resolveConflict(db, item.id, edits);

			const conflicts = await db
				.select()
				.from(knowledgeConflicts)
				.where(eq(knowledgeConflicts.itemId, item.id));
			expect(conflicts).toHaveLength(1);
			const conflict = conflicts[0];
			expect(conflict?.versionBase).toBe(item.version);
			expect(conflict?.versionCurrent).toBeGreaterThan(item.version);
			expect(conflict?.proposedBody).toBeTruthy();
			expect(conflict?.proposedBy).toBe("agent-A");
		});

		test("has all required fields for prose conflict", async ({ db }) => {
			await setupFts(db);
			const item = await create(db, proseBase);

			const edits: ConcurrentEdit[] = [
				{
					changes: { body: "Version A" },
					version: item.version,
					editor: "agent-A",
					timestamp: "2026-04-15T10:00:00.000Z",
				},
				{
					changes: { body: "Version B" },
					version: item.version,
					editor: "agent-B",
					timestamp: "2026-04-15T10:01:00.000Z",
				},
			];

			await resolveConflict(db, item.id, edits);

			const conflicts = await db
				.select()
				.from(knowledgeConflicts)
				.where(eq(knowledgeConflicts.itemId, item.id));
			expect(conflicts).toHaveLength(1);
			const conflict = conflicts[0];
			expect(conflict?.versionBase).toBe(item.version);
			expect(conflict?.versionCurrent).toBeGreaterThan(item.version);
			expect(conflict?.proposedBody).toBe("Version B");
			expect(conflict?.proposedBy).toBe("agent-B");
		});
	});

	describe("AC5: open conflict prevents promotion", () => {
		test("canPromote returns false when open conflicts exist", async ({ db }) => {
			await setupFts(db);
			const item = await create(db, proseBase);

			const edits: ConcurrentEdit[] = [
				{
					changes: { body: "Version A" },
					version: item.version,
					editor: "agent-A",
					timestamp: "2026-04-15T10:00:00.000Z",
				},
				{
					changes: { body: "Version B" },
					version: item.version,
					editor: "agent-B",
					timestamp: "2026-04-15T10:01:00.000Z",
				},
			];

			await resolveConflict(db, item.id, edits);
			expect(await canPromote(db, item.id)).toBe(false);
		});

		test("promote throws when open conflicts exist", async ({ db }) => {
			await setupFts(db);
			const item = await create(db, proseBase);

			const edits: ConcurrentEdit[] = [
				{
					changes: { body: "Version A" },
					version: item.version,
					editor: "agent-A",
					timestamp: "2026-04-15T10:00:00.000Z",
				},
				{
					changes: { body: "Version B" },
					version: item.version,
					editor: "agent-B",
					timestamp: "2026-04-15T10:01:00.000Z",
				},
			];

			await resolveConflict(db, item.id, edits);
			await expect(promote(db, item.id, "validated")).rejects.toThrow(/open conflict/i);
		});

		test("canPromote returns true when no conflicts", async ({ db }) => {
			await setupFts(db);
			const item = await create(db, structuredBase);
			expect(await canPromote(db, item.id)).toBe(true);
		});
	});

	describe("AC6: resolving conflict allows promotion", () => {
		test("allows promotion after conflict is resolved", async ({ db }) => {
			await setupFts(db);
			const item = await create(db, proseBase);

			const edits: ConcurrentEdit[] = [
				{
					changes: { body: "Version A" },
					version: item.version,
					editor: "agent-A",
					timestamp: "2026-04-15T10:00:00.000Z",
				},
				{
					changes: { body: "Version B" },
					version: item.version,
					editor: "agent-B",
					timestamp: "2026-04-15T10:01:00.000Z",
				},
			];

			await resolveConflict(db, item.id, edits);
			expect(await canPromote(db, item.id)).toBe(false);

			const conflicts = await db
				.select()
				.from(knowledgeConflicts)
				.where(eq(knowledgeConflicts.itemId, item.id));
			const conflictId = conflicts[0]?.id;
			expect(conflictId).toBeTruthy();

			if (!conflictId) throw new Error("Expected conflict to exist");
			await resolveConflictRecord(db, conflictId, "accepted");
			expect(await canPromote(db, item.id)).toBe(true);

			const currentItem = await getById(db, item.id);
			const promoted = await promote(db, item.id, "validated");
			expect(promoted.status).toBe("validated");
			expect(promoted.version).toBe((currentItem?.version ?? 0) + 1);
		});

		test("resolveConflictRecord updates status to resolved", async ({ db }) => {
			await setupFts(db);
			const item = await create(db, proseBase);

			const edits: ConcurrentEdit[] = [
				{
					changes: { body: "Version A" },
					version: item.version,
					editor: "agent-A",
					timestamp: "2026-04-15T10:00:00.000Z",
				},
				{
					changes: { body: "Version B" },
					version: item.version,
					editor: "agent-B",
					timestamp: "2026-04-15T10:01:00.000Z",
				},
			];

			await resolveConflict(db, item.id, edits);

			const conflicts = await db
				.select()
				.from(knowledgeConflicts)
				.where(eq(knowledgeConflicts.itemId, item.id));
			const conflictId = conflicts[0]?.id;
			if (!conflictId) throw new Error("Expected conflict to exist");
			await resolveConflictRecord(db, conflictId, "accepted");

			const [updated] = await db
				.select()
				.from(knowledgeConflicts)
				.where(eq(knowledgeConflicts.id, conflictId));
			expect(updated?.status).toBe("resolved");
		});
	});

	describe("mergeStructuredEdits", () => {
		test("merges non-overlapping fields", () => {
			const result = mergeStructuredEdits(
				{ title: "Original", body: "Original body", topic: "orig" },
				[
					{
						changes: { title: "New Title" },
						editor: "agent-A",
						timestamp: "2026-04-15T10:00:00.000Z",
					},
					{
						changes: { body: "New Body" },
						editor: "agent-B",
						timestamp: "2026-04-15T10:01:00.000Z",
					},
				],
			);

			expect(result.merged).toEqual({ title: "New Title", body: "New Body" });
			expect(result.fieldConflicts).toHaveLength(0);
		});

		test("picks last writer for overlapping fields", () => {
			const result = mergeStructuredEdits({ title: "Original" }, [
				{ changes: { title: "A" }, editor: "agent-A", timestamp: "2026-04-15T10:00:00.000Z" },
				{ changes: { title: "B" }, editor: "agent-B", timestamp: "2026-04-15T10:01:00.000Z" },
			]);

			expect(result.merged).toEqual({ title: "B" });
			expect(result.fieldConflicts).toHaveLength(1);
			expect(result.fieldConflicts[0]?.field).toBe("title");
			expect(result.fieldConflicts[0]?.loserValue).toBe("A");
			expect(result.fieldConflicts[0]?.loserEditor).toBe("agent-A");
		});
	});
});
