import { create as createKnowledgeItem } from "@hyperidle/fabric";
import { z } from "zod";
import type { ToolContext, ToolDefinition } from "./tool-registry.js";
import { type ToolResult, err, ok } from "./tool-result.js";

const KNOWLEDGE_LAYERS = ["L0", "L1", "L2", "L3", "L4"] as const;

const KNOWLEDGE_KINDS = [
	"pattern",
	"anti_pattern",
	"brief",
	"principle",
	"decision",
	"failure",
	"reflection",
	"focus",
] as const;

const KNOWLEDGE_FORMATS = ["markdown", "toon"] as const;

const KNOWLEDGE_STATUSES = [
	"captured",
	"provisional",
	"validated",
	"active",
	"stale",
	"archived",
] as const;

const writeMemoryInputSchema = z.object({
	layer: z.enum(KNOWLEDGE_LAYERS),
	kind: z.enum(KNOWLEDGE_KINDS),
	title: z.string().min(1),
	body: z.string().min(1),
	topic: z.string().optional(),
	format: z.enum(KNOWLEDGE_FORMATS).optional(),
	status: z.enum(KNOWLEDGE_STATUSES).optional(),
});

type WriteMemoryInput = z.infer<typeof writeMemoryInputSchema>;

async function handler(args: WriteMemoryInput, ctx: ToolContext): Promise<ToolResult> {
	const parsed = writeMemoryInputSchema.safeParse(args);
	if (!parsed.success) {
		return err("INVALID_INPUT", parsed.error.message);
	}
	const { layer, kind, title, body, topic, format, status } = parsed.data;

	const created = createKnowledgeItem(ctx.db, {
		layer,
		kind,
		title,
		body,
		topic: topic ?? null,
		format: format ?? "markdown",
		status: status ?? "active",
		updatedBy: `agent:${ctx.agentId}`,
	});

	return ok({ knowledgeItemId: created.id, version: created.version });
}

export const writeMemoryTool: ToolDefinition<WriteMemoryInput> = {
	name: "write_memory",
	description:
		"Write a new knowledge item (pattern, decision, reflection, etc.) into the knowledge fabric, attributed to the current agent. Returns the new item ID and version.",
	inputSchema: writeMemoryInputSchema,
	handler,
};
