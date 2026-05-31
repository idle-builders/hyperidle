import { tasks, users } from "@hyperidle/db";
import {
	create as createKnowledgeItem,
	KNOWLEDGE_LAYERS,
	KNOWLEDGE_STATUSES,
	type KnowledgeLayer,
} from "@hyperidle/fabric";
import { eq } from "drizzle-orm";
import z from "zod";
import type { ToolContext, ToolDefinition } from "./tool-registry.js";
import { err, ok, type ToolResult } from "./tool-result.js";

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

/**
 * Facilitator roles that may write to layers L3 and L4.
 * Non-facilitator agents are restricted to L0-L2.
 *
 * @lore I6: enforces the layer boundary described in KNOWLEDGE_ARCHITECTURE.md.
 * L3 (Practice) and L4 (Factory) are organizational knowledge that only
 * facilitator-class agents should mutate.
 */
const FACILITATOR_ROLES: ReadonlySet<string> = new Set([
	"chief_of_staff",
	"practice_facilitator",
	"product_manager",
]);

const NON_FACILITATOR_MAX_LAYER: ReadonlySet<KnowledgeLayer> = new Set(["L0", "L1", "L2"]);

async function handler(args: WriteMemoryInput, ctx: ToolContext): Promise<ToolResult> {
	const parsed = writeMemoryInputSchema.safeParse(args);
	if (!parsed.success) {
		return err("INVALID_INPUT", parsed.error.message);
	}
	const { layer, kind, title, body, topic, format, status } = parsed.data;

	// I6: restrict non-facilitator agents to L0-L2 only
	if (!NON_FACILITATOR_MAX_LAYER.has(layer)) {
		const [agent] = await ctx.db.select().from(users).where(eq(users.id, ctx.agentId)).limit(1);
		const role = agent?.role ?? "";
		if (!FACILITATOR_ROLES.has(role)) {
			return err("FORBIDDEN", `insufficient role for ${layer}`);
		}
	}

	// @lore R7: Agent-created items default to "draft" (triage) so a facilitator
	// must explicitly promote them to "active" (curated) before they enter the
	// shared knowledge base. Previously defaulted to "active", which bypassed
	// the triage queue and made agent noise indistinguishable from curated facts.
	//
	// scopeKind/scopeId: prefer ctx.teamId (harness-provided); fall back to
	// querying the task's teamId via ctx.taskId. This ensures the item is scoped
	// to the correct product scope even when the harness omits teamId explicitly.
	// materialize() filters L2 items by scopeId == productId, so the scopeId
	// must match the team's id for items to appear in the next session's workspace.
	const teamId =
		ctx.teamId ??
		(await ctx.db
			.select({ teamId: tasks.teamId })
			.from(tasks)
			.where(eq(tasks.id, ctx.taskId))
			.limit(1)
			.then((rows) => rows[0]?.teamId ?? null));
	const scopeKind = teamId ? "product" : "factory";
	const scopeId = teamId;

	const created = await createKnowledgeItem(ctx.db, {
		layer,
		kind,
		title,
		body,
		topic: topic ?? null,
		format: format ?? "markdown",
		status: status ?? "draft",
		scopeKind,
		scopeId,
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
