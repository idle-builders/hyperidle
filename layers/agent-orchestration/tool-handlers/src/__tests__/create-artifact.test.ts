/**
 * R6 — Artifacts Pipeline: RED phase tests for create_artifact skill tool.
 *
 * These tests prove the acceptance criteria for R6:
 *   AC2 — Artifacts created by agent sessions appear in WorkBet ArtifactSection
 *   AC3 — Artifacts appear in WorkPortfolio artifact gallery
 *   AC4 — Artifact metadata (kind, timestamp) renders correctly
 *     (AU21 Increment 14a: cost metadata HARD-DELETED from this AC, no replacement)
 *   AC5 — create_artifact tool is available to all agent roles
 *   AC6 — artifact_created event is emitted on creation
 *   AC8 — Input validation rejects invalid kind, mismatched preview, missing fields
 *   AC9 — Tool reads taskId from context, not from input
 *
 * @lore AE6: Updated from R6 old-kind vocabulary to the 6 fundamental kinds.
 * Old kinds (verification, decision, code_diff, deck) now return INVALID_INPUT
 * because the write path enforces ARTIFACT_KINDS at input validation time.
 * KIND_MISMATCH tests now use valid registered kinds (text, code) with
 * mismatched preview.kind values.
 */

import * as os from "node:os";
import * as path from "node:path";
import { artifacts, bets, type HyperIdleDb, tasks, teamMembers, teams } from "@hyperidle/db";
import { createTestDb, type TestDbHandle } from "@hyperidle/db/testing";
import type { ArtifactCreatedEvent, ArtifactPreview } from "@hyperidle/domain-model";
import { EventBus } from "@hyperidle/event-bus";
import type { ToolContext } from "@hyperidle/tool-protocol";
import * as work from "@hyperidle/work";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ToolHandlersPorts } from "../ports.js";
import { buildToolDefinitions } from "../tool-definitions.js";
import { STUB_TOOL_HANDLERS_PORTS } from "./stub-ports.js";

const NOW = "2026-05-30T00:00:00.000Z";

/**
 * Module-level mutable db handle the `coreApi` fakes below close over —
 * assigned fresh per test in `beforeEach`. The `ports`/`createArtifactTool`
 * consts are built once at module load (before any `db` exists), so the
 * fakes must read the CURRENT db at call time via this binding, not a
 * snapshot captured at definition time.
 */
let sharedDb: HyperIdleDb;

// Only `ports.coreApi.{getTaskById,createArtifact}` are exercised by this
// tool (AU21 §9 Increment 2: both now cross the `CoreApiPort` seam, not raw
// `ports.work` DI) — wire those to the real `@hyperidle/work` functions
// against the real test db (this is a unit-level test of the tool's own
// logic, not a §11 seam contract test — those live in core-api's
// `__tests__/core-api-port-increment2-work-users.integration.test.ts`),
// everything else stays the unused stub. `actorId` is ignored by these fakes.
const ports: ToolHandlersPorts = {
	...STUB_TOOL_HANDLERS_PORTS,
	coreApi: {
		...STUB_TOOL_HANDLERS_PORTS.coreApi,
		getTaskById: (id: string) => work.get(sharedDb, "task", id),
		createArtifact: async (input) => {
			const id = crypto.randomUUID();
			await work.create(sharedDb, "artifact", {
				id,
				producingTaskId: input.producingTaskId,
				kind: input.kind,
				label: input.label ?? null,
				previewJson: input.preview ? JSON.stringify(input.preview) : null,
				createdAt: new Date().toISOString(),
			});
			return { id, producingTaskId: input.producingTaskId, kind: input.kind };
		},
	},
};
// @lore AU20 Stage 3: createCreateArtifactTool is now private inside
// tool-definitions.ts. Obtain the tool via buildToolDefinitions — the handler
// is called with the same args/ctx as before; Zod parses inside the handler.
const createArtifactTool = buildToolDefinitions(ports).find((t) => t.name === "create_artifact")!;

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

function makeContext(
	db: HyperIdleDb,
	eventBus: EventBus,
	taskId = "task-1",
): ToolContext<HyperIdleDb> {
	return {
		db,
		eventBus,
		agentId: "agent-builder",
		sessionId: "session-r6",
		taskId,
		sandboxPath: path.join(os.tmpdir(), `hi-r6-createartifact-${Date.now()}`),
		ingestion: { dispose: (): void => {} },
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
		sharedDb = db;
		eventBus = new EventBus();
		await seed(db);
	});

	afterEach(async () => {
		await handle.close();
	});

	// -------------------------------------------------------------------- Happy path
	describe("AC2/AC4: create artifact with valid kind and preview", () => {
		it("creates an artifact row with kind=text and a preview, returns artifactId and kind", async () => {
			// @lore AE6: was kind=verification; updated to kind=text (fundamental kind)
			const result = await createArtifactTool.handler(
				{
					kind: "text",
					preview: {
						kind: "text",
						body: "All 42 unit tests passed.",
						format: "plain",
					} as ArtifactPreview,
				},
				makeContext(db, eventBus),
			);

			expect(result.success).toBe(true);
			if (!result.success) return;

			const data = result.data as { artifactId: string; kind: string };
			expect(typeof data.artifactId).toBe("string");
			expect(data.artifactId.length).toBeGreaterThan(0);
			expect(data.kind).toBe("text");

			// Verify the row was actually inserted into the database.
			const [row] = await db.select().from(artifacts).where(eq(artifacts.id, data.artifactId));

			expect(row).toBeDefined();
			expect(row?.kind).toBe("text");
			expect(row?.producingTaskId).toBe("task-1");
			expect(row?.previewJson).not.toBeNull();
		});

		it("creates an artifact with kind=text and null preview (preview is optional)", async () => {
			// @lore AE6: was kind=decision; updated to kind=text (fundamental kind)
			const result = await createArtifactTool.handler(
				{ kind: "text", preview: null },
				makeContext(db, eventBus),
			);

			expect(result.success).toBe(true);
			if (!result.success) return;

			const data = result.data as { artifactId: string; kind: string };
			expect(data.kind).toBe("text");

			const [row] = await db.select().from(artifacts).where(eq(artifacts.id, data.artifactId));

			expect(row).toBeDefined();
			expect(row?.kind).toBe("text");
			expect(row?.previewJson).toBeNull();
		});

		it("creates an artifact with kind=code and a matching preview", async () => {
			// @lore AE6: was kind=code_diff; updated to kind=code (fundamental kind)
			// @lore AM5 K4b: code preview purified from {file,hunks} to {path,lang,text}
			const result = await createArtifactTool.handler(
				{
					kind: "code",
					preview: {
						kind: "code",
						path: "src/index.ts",
						lang: "typescript",
						text: "const x = 1;\nconst y = 2;",
					} as ArtifactPreview,
				},
				makeContext(db, eventBus),
			);

			expect(result.success).toBe(true);
			if (!result.success) return;

			const data = result.data as { artifactId: string; kind: string };
			expect(data.kind).toBe("code");
		});
	});

	// -------------------------------------------------------------------- AC9: taskId from context
	describe("AC9: producingTaskId comes from ctx.taskId, not from input", () => {
		it("inserts artifact with producingTaskId equal to ctx.taskId regardless of any other field", async () => {
			// The input schema must NOT have a producingTaskId field at all.
			// Passing extra keys should be ignored or rejected by Zod's strict parsing.
			const result = await createArtifactTool.handler(
				{
					kind: "text",
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
			const [row] = await db.select().from(artifacts).where(eq(artifacts.id, data.artifactId));

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
				{ kind: "text", preview: null },
				makeContext(db, eventBus, "task-other"),
			);

			expect(result.success).toBe(true);
			if (!result.success) return;

			const data = result.data as { artifactId: string };
			const [row] = await db.select().from(artifacts).where(eq(artifacts.id, data.artifactId));

			expect(row?.producingTaskId).toBe("task-other");
		});

		it("returns NOT_FOUND when ctx.taskId does not exist in the tasks table", async () => {
			const result = await createArtifactTool.handler(
				{ kind: "text", preview: null },
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

			// @lore AE6: was kind=verification; updated to kind=text (fundamental kind)
			const result = await createArtifactTool.handler(
				{
					kind: "text",
					preview: {
						kind: "text",
						body: "10 tests passed, 0 failed.",
						format: "plain",
					} as ArtifactPreview,
				},
				makeContext(db, eventBus, "task-1"),
			);

			expect(result.success).toBe(true);
			if (!result.success) return;

			const data = result.data as { artifactId: string };

			expect(emitted).toHaveLength(1);
			expect(emitted[0]!.type).toBe("artifact_created");
			expect(emitted[0]!.artifactId).toBe(data.artifactId);
			expect(emitted[0]!.taskId).toBe("task-1");
			expect(emitted[0]!.kind).toBe("text");
			expect(typeof emitted[0]!.timestamp).toBe("number");
			expect(typeof emitted[0]!.streamId).toBe("string");
		});

		it("emits exactly one event per artifact creation (no duplicate emission)", async () => {
			const emitted: ArtifactCreatedEvent[] = [];
			// biome-ignore lint/suspicious/noExplicitAny: event type not in union yet — added by Task 2
			eventBus.on("artifact_created", (e: any) => {
				emitted.push(e);
			});

			// @lore AE6: was kind=decision; updated to kind=text (fundamental kind)
			await createArtifactTool.handler({ kind: "text", preview: null }, makeContext(db, eventBus));
			await createArtifactTool.handler({ kind: "text", preview: null }, makeContext(db, eventBus));

			expect(emitted).toHaveLength(2);
			// Each event must have a distinct artifactId.
			expect(emitted[0]!.artifactId).not.toBe(emitted[1]!.artifactId);
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
			// @lore AE6: was kind=code_diff / preview.kind=deck (both unregistered).
			// Now uses kind=code (registered) with preview.kind=text (mismatch).
			const result = await createArtifactTool.handler(
				{
					kind: "code",
					// preview.kind is "text" but kind is "code" -> mismatch
					preview: { kind: "text", body: "hello", format: "plain" } as ArtifactPreview,
				},
				makeContext(db, eventBus),
			);

			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("KIND_MISMATCH");
		});

		it("returns KIND_MISMATCH for any combination of mismatched kind/preview", async () => {
			// @lore AE6: was kind=decision / preview.kind=verification (both unregistered).
			// Now uses kind=text (registered) with preview.kind=code (mismatch).
			// @lore AM5 K4b: code preview purified from {file,hunks} to {path,lang,text}
			const result = await createArtifactTool.handler(
				{
					kind: "text",
					preview: {
						kind: "code",
						path: "src/x.ts",
						lang: null,
						text: "",
					} as ArtifactPreview,
				},
				makeContext(db, eventBus),
			);

			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("KIND_MISMATCH");
		});

		it("returns INVALID_INPUT when preview has wrong shape for the given kind", async () => {
			// @lore AE6: was kind=deck (unregistered). Now uses kind=text (registered)
			// with a preview that is missing required body/format fields.
			const result = await createArtifactTool.handler(
				{
					kind: "text",
					// preview is kind=text but missing required fields
					// biome-ignore lint/suspicious/noExplicitAny: deliberately invalid
					preview: { kind: "text" } as ArtifactPreview as any,
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
			// @lore AE6: was kind=decision; updated to kind=text (fundamental kind)
			const result = await createArtifactTool.handler(
				{ kind: "text", preview: null },
				makeContext(db, eventBus),
			);

			expect(result.success).toBe(true);
			if (!result.success) return;

			const data = result.data as { artifactId: string };
			const [row] = await db.select().from(artifacts).where(eq(artifacts.id, data.artifactId));

			expect(row?.createdAt).toBeDefined();
			// Must be a valid ISO date string
			expect(() => new Date(row?.createdAt ?? "")).not.toThrow();
			expect(new Date(row?.createdAt ?? "").toISOString()).toBe(row?.createdAt);
		});

		it("stores the preview JSON that can be parsed back to the original shape", async () => {
			// @lore AE6: was kind=verification with old preview; updated to kind=text
			const preview = {
				kind: "text" as const,
				body: "5 integration tests passed, 1 failed.",
				format: "plain" as const,
			};
			const result = await createArtifactTool.handler(
				{ kind: "text", preview },
				makeContext(db, eventBus),
			);

			expect(result.success).toBe(true);
			if (!result.success) return;

			const data = result.data as { artifactId: string };
			const [row] = await db.select().from(artifacts).where(eq(artifacts.id, data.artifactId));

			expect(row?.previewJson).not.toBeNull();
			const parsed: unknown = JSON.parse(row?.previewJson ?? "null");
			expect(parsed).toMatchObject(preview);
		});
	});
});
