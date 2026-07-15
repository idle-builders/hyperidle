import type { ToolContext, ToolDefinition, ToolResult } from "@hyperidle/shared";
import {
	err,
	KNOWLEDGE_LAYERS,
	KNOWLEDGE_STATUSES,
	type KnowledgeLayer,
	ok,
	SCOPE_KINDS,
	SCOPES_REQUIRING_ID,
	type ScopeKind,
} from "@hyperidle/shared";
import z from "zod";
import type { ToolHandlersPorts } from "./ports.js";

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
	scopeKind: z.enum(SCOPE_KINDS).optional(),
	scopeId: z.string().optional(),
});

type WriteMemoryInput = z.infer<typeof writeMemoryInputSchema>;

const FACILITATOR_ROLES: ReadonlySet<string> = new Set([
	"assistant",
	"facilitator",
	"product_manager",
]);

const NON_FACILITATOR_MAX_LAYER: ReadonlySet<KnowledgeLayer> = new Set(["L0", "L1", "L2"]);

async function handler<TDb>(
	args: WriteMemoryInput,
	ctx: ToolContext<TDb>,
	ports: ToolHandlersPorts<TDb>,
): Promise<ToolResult> {
	const parsed = writeMemoryInputSchema.safeParse(args);
	if (!parsed.success) {
		return err("INVALID_INPUT", parsed.error.message);
	}
	const { layer, kind, title, body, topic, format, status } = parsed.data;
	const requestedScopeKind = parsed.data.scopeKind;
	const requestedScopeId = parsed.data.scopeId?.trim();

	if (requestedScopeKind && SCOPES_REQUIRING_ID.has(requestedScopeKind) && !requestedScopeId) {
		return err("INVALID_INPUT", `scopeId is required for scopeKind '${requestedScopeKind}'`);
	}

	if (!NON_FACILITATOR_MAX_LAYER.has(layer)) {
		const agent = await ports.users.getUserById(ctx.db, ctx.agentId);
		const role = agent?.role ?? "";
		if (!FACILITATOR_ROLES.has(role)) {
			return err("FORBIDDEN", `insufficient role for ${layer}`);
		}
	}

	const teamId =
		ctx.teamId ??
		(await ports.work.getTaskById(ctx.db, ctx.taskId).then((row) => row?.teamId ?? null));
	const defaultScopeKind: ScopeKind = teamId ? "product" : "factory";
	const scopeKind = requestedScopeKind ?? defaultScopeKind;
	const scopeId =
		scopeKind === "user"
			? (requestedScopeId ?? ctx.agentId)
			: (requestedScopeId ?? (scopeKind === defaultScopeKind ? teamId : null));

	const created = await ports.knowledge.create(ctx.db, {
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

export function createWriteMemoryTool<TDb>(
	ports: ToolHandlersPorts<TDb>,
): ToolDefinition<WriteMemoryInput, TDb> {
	return {
		name: "write_memory",
		description:
			"Write a new knowledge item (pattern, decision, reflection, etc.) into the knowledge fabric, attributed to the current agent. Returns the new item ID and version.",
		inputSchema: writeMemoryInputSchema,
		handler: (args, ctx) => handler(args, ctx, ports),
	};
}
