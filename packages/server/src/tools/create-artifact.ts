/**
 * AE6 — create_artifact skill tool.
 *
 * Allows agent sessions to record a produced artifact in the kernel artifacts table.
 * Updated from R6 (13 business-domain kinds) to AE6 (6 fundamental kinds + labels).
 *
 * Security constraints:
 *   - `producingTaskId` is always read from `ctx.taskId`, never from agent input.
 *   - `kind` is constrained to the 6 registered fundamental kinds.
 *   - `label` is validated as lowercase_snake_case, max 64 chars.
 *
 * @lore R6: Kind/preview mismatch is a two-step check: (1) Zod validates the
 * preview shape independently, then (2) we verify preview.kind === kind. This
 * order means a structurally-invalid preview (missing fields) returns
 * INVALID_INPUT before the mismatch check can fire.
 * @lore AE6: WRITABLE_ARTIFACT_KINDS replaced with ARTIFACT_KINDS from registry.
 * The label parameter is new — optional business-domain tag for context.
 */

import { randomUUID } from "node:crypto";
import { artifacts, tasks } from "@hyperidle/db";
import { ARTIFACT_KINDS, type ArtifactCreatedEvent, REVIEW_SURFACES } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import z from "zod";
import { readSurfaceEntries, resolveSurfacesDir } from "../routes/surfaces.js";
import { artifactPreviewSchema } from "../schemas/artifact-preview.js";
import type { ToolContext, ToolDefinition } from "./tool-registry.js";
import { err, ok, type ToolResult } from "./tool-result.js";

/**
 * Build a human-readable list of available surface names for the agent description.
 * Merges built-in REVIEW_SURFACES with folder surfaces read at call time.
 * Folder surfaces are read lazily (per tool invocation context) so new drops
 * appear without a server restart.
 *
 * @lore AL5: Built-ins appear first; folder surfaces append after. If a folder
 * surface has the same name as a built-in, it does not appear twice (the built-in
 * wins at render time anyway). We include both in the description as documentation
 * would be confusing if we silently dropped one.
 */
function buildSurfaceNamesDescription(): string {
	const folderEntries = readSurfaceEntries(resolveSurfacesDir());
	// Merge: built-ins first, then folder surfaces not already in built-ins
	const builtinNames = new Set(REVIEW_SURFACES.map((s) => s.name));
	const allEntries = [
		...REVIEW_SURFACES,
		...folderEntries.filter((e) => !builtinNames.has(e.name)),
	];
	return allEntries.length > 0
		? "Available named surfaces:\n" +
				allEntries.map((s) => `- '${s.name}': ${s.description}`).join("\n")
		: "No named surfaces registered.";
}

/**
 * Read surface names description once at module load time.
 * This includes both built-in and folder surfaces present at startup.
 * Agents see new folder surfaces on next server restart (documented model).
 *
 * @lore AL5: We call at module load (not per-request) because Zod schema
 * .describe() is static — baked in at schema construction time. The cost is
 * one fs.readdir per server start, which is negligible.
 */
const SURFACE_NAMES_DESCRIPTION = buildSurfaceNamesDescription();

const createArtifactInputSchema = z.object({
	kind: z
		.enum(ARTIFACT_KINDS)
		.describe(
			"The fundamental content type. Determines the review experience:\n" +
				"- 'text': markdown/prose (contracts, emails, decisions, analyses)\n" +
				"- 'code': source code diffs\n" +
				"- 'image': visual assets (screenshots, designs, diagrams)\n" +
				"- 'data': structured metrics and tables\n" +
				"- 'html': rich rendered content (dashboards, charts, visualizations)\n" +
				"- 'url': references to external resources (deployed services, PRs)",
		),
	label: z
		.string()
		.regex(/^[a-z][a-z0-9_]*$/, "Label must be lowercase_snake_case")
		.max(64)
		.optional()
		.nullable()
		.describe(
			"Optional business-domain tag (e.g., 'contract', 'email', 'dashboard'). Does not affect rendering.",
		),
	/**
	 * AL5 (simplified + drop-in): optional named review surface override.
	 * When set to a known surface name, the web renders that component instead of
	 * the family canvas. Unknown names silently degrade to the family canvas (safe floor).
	 * Folder surfaces (from ~/.hyperidle/surfaces/) are included if present at server start.
	 */
	surface: z
		.string()
		.max(200)
		.optional()
		.nullable()
		.describe(
			`Optional named review surface to use instead of the family canvas.\n${SURFACE_NAMES_DESCRIPTION}\nIf omitted or unknown, the standard family canvas renders (safe default).`,
		),
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
		label: input.label ?? null,
		previewJson: input.preview !== null ? JSON.stringify(input.preview) : null,
		surface: input.surface ?? null,
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
		"Record an artifact produced by the current agent session. " +
		"The artifact is linked to the current task via context — the producingTaskId is never taken from input.\n\n" +
		"Kind determines the review experience:\n" +
		"- 'text': markdown/prose (contracts, emails, decisions, analyses)\n" +
		"- 'code': source code diffs\n" +
		"- 'image': visual assets (screenshots, designs, diagrams)\n" +
		"- 'data': structured metrics and tables\n" +
		"- 'html': rich rendered content (dashboards, charts, visualizations)\n" +
		"- 'url': references to external resources (deployed services, PRs)\n\n" +
		"Optional label provides business context (e.g., label='contract' on a text artifact).",
	inputSchema: createArtifactInputSchema,
	handler,
};
