import { type HyperIdleDb, createTestDb, knowledgeConflicts } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
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

function makeDb(): HyperIdleDb {
	const db = createTestDb();
	setupFts(db);
	return db;
}

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
	let db: HyperIdleDb;

	beforeEach(() => {
		db = makeDb();
	});

	// AC1: Two edits to different fields of structured practice: both apply, no conflict record.
	describe("AC1: structured item, different fields", () => {
		it("applies both edits with no conflict record", () => {
			const item = create(db, structuredBase);

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

			const result = resolveConflict(db, item.id, edits);

			expect(result.merged).toBe(true);
			expect(result.conflicts).toHaveLength(0);

			const updated = getById(db, item.id);
			expect(updated?.title).toBe("Updated Title");
			expect(updated?.body).toBe("Updated Body");

			// No conflict records in DB
			const conflicts = db
				.select()
				.from(knowledgeConflicts)
				.where(eq(knowledgeConflicts.itemId, item.id))
				.all();
			expect(conflicts).toHaveLength(0);
		});

		it("applies different meta fields without conflict", () => {
			const item = create(db, {
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

			const result = resolveConflict(db, item.id, edits);
			expect(result.merged).toBe(true);
			expect(result.conflicts).toHaveLength(0);

			const updated = getById(db, item.id);
			expect(updated?.title).toBe("New Title");
			expect(updated?.topic).toBe("new-topic");
		});
	});

	// AC2: Two edits to same field of structured practice: last writer wins, conflict record created.
	describe("AC2: structured item, same field", () => {
		it("last writer wins for same field with conflict record", () => {
			const item = create(db, structuredBase);

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

			const result = resolveConflict(db, item.id, edits);

			expect(result.merged).toBe(true);
			expect(result.conflicts).toHaveLength(1);
			expect(result.conflicts[0]?.field).toBe("title");

			const updated = getById(db, item.id);
			// B is later, so B wins
			expect(updated?.title).toBe("Title from B");

			// Conflict record created in DB
			const conflicts = db
				.select()
				.from(knowledgeConflicts)
				.where(eq(knowledgeConflicts.itemId, item.id))
				.all();
			expect(conflicts).toHaveLength(1);
			expect(conflicts[0]?.status).toBe("resolved");
			expect(conflicts[0]?.proposedBy).toBe("agent-A");
			expect(conflicts[0]?.proposedBody).toContain("Title from A");
		});

		it("handles mix of conflicting and non-conflicting fields", () => {
			const item = create(db, structuredBase);

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

			const result = resolveConflict(db, item.id, edits);

			expect(result.merged).toBe(true);
			// title conflicted (same field)
			expect(result.conflicts).toHaveLength(1);

			const updated = getById(db, item.id);
			expect(updated?.title).toBe("Title from B"); // LWW
			expect(updated?.topic).toBe("topic-A"); // no conflict, applied
			expect(updated?.body).toBe("Body from B"); // no conflict, applied
		});
	});

	// AC3: Two edits to prose item: both versions stored, conflict record with status 'open', older version remains active.
	describe("AC3: prose item conflicts", () => {
		it("creates open conflict record and keeps older version active", () => {
			const item = create(db, proseBase);

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

			const result = resolveConflict(db, item.id, edits);

			expect(result.merged).toBe(false);
			expect(result.conflicts).toHaveLength(1);

			// Older version (A, earlier timestamp) remains active
			const updated = getById(db, item.id);
			expect(updated?.body).toBe("Reflection version A");

			// Conflict record with status 'open'
			const conflicts = db
				.select()
				.from(knowledgeConflicts)
				.where(eq(knowledgeConflicts.itemId, item.id))
				.all();
			expect(conflicts).toHaveLength(1);
			expect(conflicts[0]?.status).toBe("open");
			expect(conflicts[0]?.proposedBody).toBe("Reflection version B");
			expect(conflicts[0]?.proposedBy).toBe("agent-B");
		});

		it("handles prose kinds: brief, principle, focus", () => {
			for (const kind of ["brief", "principle", "focus"] as const) {
				const localDb = makeDb();
				const item = create(localDb, { ...proseBase, kind });

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

				const result = resolveConflict(localDb, item.id, edits);
				expect(result.merged).toBe(false);

				const conflicts = localDb
					.select()
					.from(knowledgeConflicts)
					.where(eq(knowledgeConflicts.itemId, item.id))
					.all();
				expect(conflicts).toHaveLength(1);
				expect(conflicts[0]?.status).toBe("open");
			}
		});
	});

	// AC4: Conflict record contains version_base, version_current, proposed_body, proposed_by.
	describe("AC4: conflict record fields", () => {
		it("has all required fields for structured conflict", () => {
			const item = create(db, structuredBase);

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

			resolveConflict(db, item.id, edits);

			const conflicts = db
				.select()
				.from(knowledgeConflicts)
				.where(eq(knowledgeConflicts.itemId, item.id))
				.all();
			expect(conflicts).toHaveLength(1);
			const conflict = conflicts[0];
			expect(conflict?.versionBase).toBe(item.version);
			expect(conflict?.versionCurrent).toBeGreaterThan(item.version);
			expect(conflict?.proposedBody).toBeTruthy();
			expect(conflict?.proposedBy).toBe("agent-A");
		});

		it("has all required fields for prose conflict", () => {
			const item = create(db, proseBase);

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

			resolveConflict(db, item.id, edits);

			const conflicts = db
				.select()
				.from(knowledgeConflicts)
				.where(eq(knowledgeConflicts.itemId, item.id))
				.all();
			expect(conflicts).toHaveLength(1);
			const conflict = conflicts[0];
			expect(conflict?.versionBase).toBe(item.version);
			expect(conflict?.versionCurrent).toBeGreaterThan(item.version);
			expect(conflict?.proposedBody).toBe("Version B");
			expect(conflict?.proposedBy).toBe("agent-B");
		});
	});

	// AC5: Open conflict prevents promotion to VALIDATED status.
	describe("AC5: open conflict prevents promotion", () => {
		it("canPromote returns false when open conflicts exist", () => {
			const item = create(db, proseBase);

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

			resolveConflict(db, item.id, edits);

			expect(canPromote(db, item.id)).toBe(false);
		});

		it("promote throws when open conflicts exist", () => {
			const item = create(db, proseBase);

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

			resolveConflict(db, item.id, edits);

			expect(() => promote(db, item.id, "validated")).toThrow(/open conflict/i);
		});

		it("canPromote returns true when no conflicts", () => {
			const item = create(db, structuredBase);
			expect(canPromote(db, item.id)).toBe(true);
		});
	});

	// AC6: Resolving conflict (status 'resolved') allows promotion.
	describe("AC6: resolving conflict allows promotion", () => {
		it("allows promotion after conflict is resolved", () => {
			const item = create(db, proseBase);

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

			resolveConflict(db, item.id, edits);

			// Should not be promotable yet
			expect(canPromote(db, item.id)).toBe(false);

			// Find and resolve the conflict
			const conflicts = db
				.select()
				.from(knowledgeConflicts)
				.where(eq(knowledgeConflicts.itemId, item.id))
				.all();
			const conflictId = conflicts[0]?.id;
			expect(conflictId).toBeTruthy();

			if (!conflictId) throw new Error("Expected conflict to exist");
			resolveConflictRecord(db, conflictId, "accepted");

			// Now should be promotable
			expect(canPromote(db, item.id)).toBe(true);

			// And promote should succeed
			const currentItem = getById(db, item.id);
			const promoted = promote(db, item.id, "validated");
			expect(promoted.status).toBe("validated");
			expect(promoted.version).toBe((currentItem?.version ?? 0) + 1);
		});

		it("resolveConflictRecord updates status to resolved", () => {
			const item = create(db, proseBase);

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

			resolveConflict(db, item.id, edits);

			const conflicts = db
				.select()
				.from(knowledgeConflicts)
				.where(eq(knowledgeConflicts.itemId, item.id))
				.all();

			const conflictId = conflicts[0]?.id;
			if (!conflictId) throw new Error("Expected conflict to exist");
			resolveConflictRecord(db, conflictId, "accepted");

			const updated = db
				.select()
				.from(knowledgeConflicts)
				.where(eq(knowledgeConflicts.id, conflictId))
				.get();
			expect(updated?.status).toBe("resolved");
		});
	});

	// mergeStructuredEdits unit tests
	describe("mergeStructuredEdits", () => {
		it("merges non-overlapping fields", () => {
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

		it("picks last writer for overlapping fields", () => {
			const result = mergeStructuredEdits({ title: "Original" }, [
				{
					changes: { title: "A" },
					editor: "agent-A",
					timestamp: "2026-04-15T10:00:00.000Z",
				},
				{
					changes: { title: "B" },
					editor: "agent-B",
					timestamp: "2026-04-15T10:01:00.000Z",
				},
			]);

			expect(result.merged).toEqual({ title: "B" });
			expect(result.fieldConflicts).toHaveLength(1);
			expect(result.fieldConflicts[0]?.field).toBe("title");
			expect(result.fieldConflicts[0]?.loserValue).toBe("A");
			expect(result.fieldConflicts[0]?.loserEditor).toBe("agent-A");
		});
	});
});
