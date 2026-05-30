/**
 * R6 — create_artifact skill tool.
 *
 * Allows agent sessions to record a produced artifact (code diff, deck,
 * decision, verification result, etc.) in the kernel artifacts table.
 *
 * Security constraints:
 *   - `producingTaskId` is always read from `ctx.taskId`, never from agent
 *     input. This prevents an agent from claiming authorship of another task's
 *     artifacts.
 *   - Input schema does NOT include a `producingTaskId` field.
 *
 * @lore R6: Kind/preview mismatch is a two-step check: (1) Zod validates the
 * preview shape independently, then (2) we verify preview.kind === kind. This
 * order means a structurally-invalid preview (missing fields) returns
 * INVALID_INPUT before the mismatch check can fire.
 */

import { randomUUID } from "node:crypto";
import { artifacts, tasks } from "@hyperidle/db";
import type { ArtifactCreatedEvent } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import z from "zod";
import { artifactPreviewSchema } from "../schemas/artifact-preview.js";
import type { ToolContext, ToolDefinition } from "./tool-registry.js";
import { err, ok, type ToolResult } from "./tool-result.js";

// Exclude unknown_kind from what agents may write.
// @lore R6: `unknown_kind` is a read-side sentinel for unrecognised DB values;
// agents must never write it. The closed write rule is enforced at the schema
// boundary so the error message names the violation clearly.
const WRITABLE_ARTIFACT_KINDS = [
	"code_diff",
	"deck",
	"contract",
	"dashboard",
	"screenshot",
	"drafted_email",
	"design",
	"data_analysis",
	"decision",
	"running_service",
	"comm_draft",
	"verification",
] as const;

const createArtifactInputSchema = z.object({
	kind: z.enum(WRITABLE_ARTIFACT_KINDS),
	preview: artifactPreviewSchema.nullable(),
});

type CreateArtifactInput = z.infer<typeof createArtifactInputSchema>;

async function handler(args: CreateArtifactInput, ctx: ToolContext): Promise<ToolResult> {
	const parsed = createArtifactInputSchema.safeParse(args);
	if (!parsed.success) {
		return err("INVALID_INPUT", parsed.error.message);
	}
	const input = parsed.data;

	// Check kind/preview discriminant match.
	// This is checked AFTER Zod validates the preview shape (so a structurally
	// invalid preview returns INVALID_INPUT before we get here).
	if (input.preview !== null && input.preview.kind !== input.kind) {
		return err(
			"KIND_MISMATCH",
			`Preview kind '${input.preview.kind}' does not match artifact kind '${input.kind}'`,
		);
	}

	// Verify the producing task exists (ctx.taskId is authoritative).
	const [taskRow] = await ctx.db
		.select({ title: tasks.title })
		.from(tasks)
		.where(eq(tasks.id, ctx.taskId))
		.limit(1);

	if (!taskRow) {
		return err("NOT_FOUND", `Task not found: ${ctx.taskId}`);
	}

	const artifactId = randomUUID();
	const now = new Date().toISOString();

	await ctx.db.insert(artifacts).values({
		id: artifactId,
		producingTaskId: ctx.taskId,
		kind: input.kind,
		previewJson: input.preview !== null ? JSON.stringify(input.preview) : null,
		createdAt: now,
	});

	const event: ArtifactCreatedEvent = {
		type: "artifact_created",
		streamId: randomUUID(),
		artifactId,
		taskId: ctx.taskId,
		kind: input.kind,
		timestamp: Date.now(),
	};
	ctx.eventBus.emit(event);

	return ok({ artifactId, kind: input.kind });
}

export const createArtifactTool: ToolDefinition<CreateArtifactInput> = {
	name: "create_artifact",
	description:
		"Record an artifact produced by the current agent session (code diff, verification result, decision, deck, etc.). The artifact is linked to the current task via context — the producingTaskId is never taken from input.",
	inputSchema: createArtifactInputSchema,
	handler,
};
