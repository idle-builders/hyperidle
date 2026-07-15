import { randomUUID } from "node:crypto";
import {
	ARTIFACT_KINDS,
	type ArtifactCreatedEvent,
	artifactPreviewSchema,
	err,
	ok,
	type ToolContext,
	type ToolDefinition,
	type ToolResult,
} from "@hyperidle/shared";
import z from "zod";
import type { ToolHandlersPorts } from "./ports.js";

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
	preview: artifactPreviewSchema.nullable(),
});

type CreateArtifactInput = z.infer<typeof createArtifactInputSchema>;

async function handler<TDb>(
	args: CreateArtifactInput,
	ctx: ToolContext<TDb>,
	ports: ToolHandlersPorts<TDb>,
): Promise<ToolResult> {
	const parsed = createArtifactInputSchema.safeParse(args);
	if (!parsed.success) {
		return err("INVALID_INPUT", parsed.error.message);
	}
	const input = parsed.data;

	if (input.preview !== null && input.preview.kind !== input.kind) {
		return err(
			"KIND_MISMATCH",
			`Preview kind '${input.preview.kind}' does not match artifact kind '${input.kind}'`,
		);
	}

	const taskRow = await ports.work.getTaskById(ctx.db, ctx.taskId);
	if (!taskRow) {
		return err("NOT_FOUND", `Task not found: ${ctx.taskId}`);
	}

	const artifactId = randomUUID();
	const now = new Date().toISOString();

	await ports.work.createArtifact(ctx.db, {
		id: artifactId,
		producingTaskId: ctx.taskId,
		kind: input.kind,
		label: input.label ?? null,
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

export function createCreateArtifactTool<TDb>(
	ports: ToolHandlersPorts<TDb>,
): ToolDefinition<CreateArtifactInput, TDb> {
	return {
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
		handler: (args, ctx) => handler(args, ctx, ports),
	};
}
