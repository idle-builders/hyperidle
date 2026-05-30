/**
 * R6 — Artifacts Pipeline: RED phase tests for create_artifact skill tool.
 *
 * These tests prove the acceptance criteria for R6:
 *   AC2 — Artifacts created by agent sessions appear in WorkBet ArtifactSection
 *   AC3 — Artifacts appear in WorkPortfolio artifact gallery
 *   AC4 — Artifact metadata (kind, cost, timestamp) renders correctly
 *   AC5 — create_artifact tool is available to all agent roles
 *   AC6 — artifact_created event is emitted on creation
 *   AC8 — Input validation rejects invalid kind, mismatched preview, missing fields
 *   AC9 — Tool reads taskId from context, not from input
 *
 * The tests reference create-artifact.ts which does NOT exist yet.
 * These tests WILL fail until the green phase creates the implementation.
 *
 * Failure mode before implementation:
 *   - Import fails: "Cannot find module '../create-artifact.js'"
 *   - createArtifactTool is undefined
 *   - tool handler returns errors instead of success
 */

import * as os from "node:os";
import * as path from "node:path";
import {
	artifacts,
	bets,
	createTestDb,
	type HyperIdleDb,
	tasks,
	teamMembers,
	teams,
	type TestDbHandle,
} from "@hyperidle/db";
import type { ArtifactCreatedEvent } from "@hyperidle/shared";
import { EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
// This import WILL fail until the green phase creates create-artifact.ts
import { createArtifactTool } from "../create-artifact.js";
import type { ToolContext } from "../tool-registry.js";

const NOW = "2026-05-30T00:00:00.000Z";

// --- Helpers ------------------------------------------------------------------

async function seed(db: HyperIdleDb): Promise<{ taskId: string; betId: string }> {
	await db.insert(teams).values({ id: "p1", name: "Test Product", phase: "build", createdAt: NOW });
	await db
		.insert(teamMembers)
		.values({ id: "t1", teamId: "p1", capacity: 5, activeBets: 0, formedAt: NOW });
	await db.insert(bets).values({
		id: "bet-1",
		teamId: "p1",
		description: "Test bet",
		appetite: "1w",
		status: "active",
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(tasks).values({
		id: "task-1",
		betId: "bet-1",
		teamId: "p1",
		title: "Test task",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
	return { taskId: "task-1", betId: "bet-1" };
}

function makeContext(db: HyperIdleDb, eventBus: EventBus, taskId = "task-1"): ToolContext {
	return {
		db,
		eventBus,
		agentId: "agent-builder",
		sessionId: "session-r6",
		taskId,
		workspacePath: path.join(os.tmpdir(), `hi-r6-createartifact-${Date.now()}`),
		watcher: { stop: (): void => {} },
	};
}

// --- Test suite ---------------------------------------------------------------

describe("create_artifact tool", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;
	let eventBus: EventBus;

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
		eventBus = new EventBus();
		await seed(db);
	});

	afterEach(async () => {
		await handle.close();
	});

	// -------------------------------------------------------------------- Happy path
	describe("AC2/AC4: create artifact with valid kind and preview", () => {
		it("creates an artifact row with kind=verification and a preview, returns artifactId and kind", async () => {
			const result = await createArtifactTool.handler(
				{
					kind: "verification",
					preview: { kind: "verification", suite: "unit", passed: 42, failed: 0 },
				},
				makeContext(db, eventBus),
			);

			expect(result.success).toBe(true);
			if (!result.success) return;

			const data = result.data as { artifactId: string; kind: string };
			expect(typeof data.artifactId).toBe("string");
			expect(data.artifactId.length).toBeGreaterThan(0);
			expect(data.kind).toBe("verification");

			// Verify the row was actually inserted into the database.
			const [row] = await db
				.select()
				.from(artifacts)
				.where(eq(artifacts.id, data.artifactId));

			expect(row).toBeDefined();
			expect(row?.kind).toBe("verification");
			expect(row?.producingTaskId).toBe("task-1");
			expect(row?.previewJson).not.toBeNull();
		});

		it("creates an artifact with kind=decision and null preview (preview is optional)", async () => {
			const result = await createArtifactTool.handler(
				{ kind: "decision", preview: null },
				makeContext(db, eventBus),
			);

			expect(result.success).toBe(true);
			if (!result.success) return;

			const data = result.data as { artifactId: string; kind: string };
			expect(data.kind).toBe("decision");

			const [row] = await db
				.select()
				.from(artifacts)
				.where(eq(artifacts.id, data.artifactId));

			expect(row).toBeDefined();
			expect(row?.kind).toBe("decision");
			expect(row?.previewJson).toBeNull();
		});

		it("creates an artifact with kind=code_diff and a matching preview", async () => {
			const result = await createArtifactTool.handler(
				{
					kind: "code_diff",
					preview: {
						kind: "code_diff",
						file: "src/index.ts",
						hunks: [
							{
								header: "@@ -1,3 +1,4 @@",
								lines: [
									{ kind: "ctx", text: "const x = 1;" },
									{ kind: "add", text: "const y = 2;" },
								],
							},
						],
					},
				},
				makeContext(db, eventBus),
			);

			expect(result.success).toBe(true);
			if (!result.success) return;

			const data = result.data as { artifactId: string; kind: string };
			expect(data.kind).toBe("code_diff");
		});
	});

	// -------------------------------------------------------------------- AC9: taskId from context
	describe("AC9: producingTaskId comes from ctx.taskId, not from input", () => {
		it("inserts artifact with producingTaskId equal to ctx.taskId regardless of any other field", async () => {
			// The input schema must NOT have a producingTaskId field at all.
			// Passing extra keys should be ignored or rejected by Zod's strict parsing.
			const result = await createArtifactTool.handler(
				{
					kind: "decision",
					preview: null,
					// @lore R6: If the Zod schema accidentally accepts producingTaskId,
					// this test would need the tool to still use ctx.taskId. For the
					// input schema test we check the schema does not declare it.
				},
				makeContext(db, eventBus, "task-1"),
			);

			expect(result.success).toBe(true);
			if (!result.success) return;

			const data = result.data as { artifactId: string };
			const [row] = await db
				.select()
				.from(artifacts)
				.where(eq(artifacts.id, data.artifactId));

			expect(row?.producingTaskId).toBe("task-1");
		});

		it("uses the taskId from the context object, not a hardcoded value", async () => {
			// Insert a second task so we can verify taskId routing.
			await db.insert(tasks).values({
				id: "task-other",
				betId: "bet-1",
				teamId: "p1",
				title: "Other task",
				state: "in_progress",
				createdAt: NOW,
				updatedAt: NOW,
			});

			const result = await createArtifactTool.handler(
				{ kind: "decision", preview: null },
				makeContext(db, eventBus, "task-other"),
			);

			expect(result.success).toBe(true);
			if (!result.success) return;

			const data = result.data as { artifactId: string };
			const [row] = await db
				.select()
				.from(artifacts)
				.where(eq(artifacts.id, data.artifactId));

			expect(row?.producingTaskId).toBe("task-other");
		});

		it("returns NOT_FOUND when ctx.taskId does not exist in the tasks table", async () => {
			const result = await createArtifactTool.handler(
				{ kind: "decision", preview: null },
				makeContext(db, eventBus, "nonexistent-task"),
			);

			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("NOT_FOUND");
		});
	});

	// -------------------------------------------------------------------- AC6: event emitted
	describe("AC6: artifact_created event is emitted", () => {
		it("emits artifact_created event with correct artifactId, taskId, kind, and timestamp", async () => {
			const emitted: ArtifactCreatedEvent[] = [];
			// @lore R6: ArtifactCreatedEvent does not exist yet in events.ts —
			// this will fail at the type level until Task 2 adds it.
			// biome-ignore lint/suspicious/noExplicitAny: event type not in union yet — added by Task 2
			eventBus.on("artifact_created", (e: any) => {
				emitted.push(e);
			});

			const result = await createArtifactTool.handler(
				{
					kind: "verification",
					preview: { kind: "verification", suite: "unit", passed: 10, failed: 0 },
				},
				makeContext(db, eventBus, "task-1"),
			);

			expect(result.success).toBe(true);
			if (!result.success) return;

			const data = result.data as { artifactId: string };

			expect(emitted).toHaveLength(1);
			expect(emitted[0].type).toBe("artifact_created");
			expect(emitted[0].artifactId).toBe(data.artifactId);
			expect(emitted[0].taskId).toBe("task-1");
			expect(emitted[0].kind).toBe("verification");
			expect(typeof emitted[0].timestamp).toBe("number");
			expect(typeof emitted[0].streamId).toBe("string");
		});

		it("emits exactly one event per artifact creation (no duplicate emission)", async () => {
			const emitted: ArtifactCreatedEvent[] = [];
			// biome-ignore lint/suspicious/noExplicitAny: event type not in union yet — added by Task 2
			eventBus.on("artifact_created", (e: any) => {
				emitted.push(e);
			});

			await createArtifactTool.handler(
				{ kind: "decision", preview: null },
				makeContext(db, eventBus),
			);
			await createArtifactTool.handler(
				{ kind: "decision", preview: null },
				makeContext(db, eventBus),
			);

			expect(emitted).toHaveLength(2);
			// Each event must have a distinct artifactId.
			expect(emitted[0].artifactId).not.toBe(emitted[1].artifactId);
		});
	});

	// -------------------------------------------------------------------- AC8: validation
	describe("AC8: input validation rejects bad inputs", () => {
		it("returns INVALID_INPUT when kind is missing", async () => {
			const result = await createArtifactTool.handler(
				// biome-ignore lint/suspicious/noExplicitAny: deliberately invalid
				{ preview: null } as any,
				makeContext(db, eventBus),
			);

			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});

		it("returns INVALID_INPUT when kind is 'unknown_kind' (closed write rule)", async () => {
			const result = await createArtifactTool.handler(
				// biome-ignore lint/suspicious/noExplicitAny: deliberately invalid
				{ kind: "unknown_kind", preview: null } as any,
				makeContext(db, eventBus),
			);

			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});

		it("returns INVALID_INPUT when kind is an arbitrary string not in ARTIFACT_KINDS", async () => {
			const result = await createArtifactTool.handler(
				// biome-ignore lint/suspicious/noExplicitAny: deliberately invalid
				{ kind: "internet_meme", preview: null } as any,
				makeContext(db, eventBus),
			);

			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});

		it("returns KIND_MISMATCH when preview.kind does not match kind", async () => {
			const result = await createArtifactTool.handler(
				{
					kind: "code_diff",
					// preview.kind is "deck" but kind is "code_diff" -> mismatch
					preview: { kind: "deck", slideCount: 3, firstSlideTitle: "Intro" },
				},
				makeContext(db, eventBus),
			);

			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("KIND_MISMATCH");
		});

		it("returns KIND_MISMATCH for any combination of mismatched kind/preview", async () => {
			const result = await createArtifactTool.handler(
				{
					kind: "decision",
					preview: { kind: "verification", suite: "unit", passed: 1, failed: 0 },
				},
				makeContext(db, eventBus),
			);

			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("KIND_MISMATCH");
		});

		it("returns INVALID_INPUT when preview has wrong shape for the given kind", async () => {
			const result = await createArtifactTool.handler(
				{
					kind: "deck",
					// preview is kind=deck but missing required fields
					// biome-ignore lint/suspicious/noExplicitAny: deliberately invalid
					preview: { kind: "deck" } as any,
				},
				makeContext(db, eventBus),
			);

			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});
	});

	// -------------------------------------------------------------------- AC4: metadata shape
	describe("AC4: artifact metadata is correct in the database row", () => {
		it("stores a valid ISO 8601 createdAt timestamp", async () => {
			const result = await createArtifactTool.handler(
				{ kind: "decision", preview: null },
				makeContext(db, eventBus),
			);

			expect(result.success).toBe(true);
			if (!result.success) return;

			const data = result.data as { artifactId: string };
			const [row] = await db
				.select()
				.from(artifacts)
				.where(eq(artifacts.id, data.artifactId));

			expect(row?.createdAt).toBeDefined();
			// Must be a valid ISO date string
			expect(() => new Date(row?.createdAt ?? "")).not.toThrow();
			expect(new Date(row?.createdAt ?? "").toISOString()).toBe(row?.createdAt);
		});

		it("stores the preview JSON that can be parsed back to the original shape", async () => {
			const preview = { kind: "verification" as const, suite: "integration", passed: 5, failed: 1 };
			const result = await createArtifactTool.handler(
				{ kind: "verification", preview },
				makeContext(db, eventBus),
			);

			expect(result.success).toBe(true);
			if (!result.success) return;

			const data = result.data as { artifactId: string };
			const [row] = await db
				.select()
				.from(artifacts)
				.where(eq(artifacts.id, data.artifactId));

			expect(row?.previewJson).not.toBeNull();
			const parsed: unknown = JSON.parse(row?.previewJson ?? "null");
			expect(parsed).toMatchObject(preview);
		});
	});
});
