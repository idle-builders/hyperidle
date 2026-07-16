import { randomUUID } from "node:crypto";
import type { ToolContext, ToolDefinition, ToolResult } from "@hyperidle/shared";
import { err, ok } from "@hyperidle/shared";
import z from "zod";
import type {
	ToolHandlersHandoffMetadata,
	ToolHandlersHandoffParams,
	ToolHandlersPorts,
	ToolHandlersSessionContext,
} from "./ports.js";

const HANDOFF_STATUSES = ["completed", "failed", "blocked", "in_progress"] as const;

const handoffToInputSchema = z.object({
	toAgent: z.string().optional(),
	toRole: z.string().optional(),
	toHuman: z.boolean().optional(),
	contextId: z.string().min(1),
	status: z.enum(HANDOFF_STATUSES),
	reason: z.string().min(1),
	artifacts: z.array(z.string()).optional(),
	remainingWork: z.array(z.string()).optional(),
	error: z.string().optional(),
});

type HandoffToInput = z.infer<typeof handoffToInputSchema>;

async function handler<TDb>(
	args: HandoffToInput,
	ctx: ToolContext<TDb>,
	ports: ToolHandlersPorts<TDb>,
): Promise<ToolResult> {
	const parsed = handoffToInputSchema.safeParse(args);
	if (!parsed.success) {
		return err("INVALID_INPUT", parsed.error.message);
	}
	const input = parsed.data;

	if (!(input.toAgent || input.toRole || input.toHuman)) {
		return err("INVALID_INPUT", "One of toAgent, toRole, or toHuman must be specified");
	}

	if (input.toAgent) {
		const target = await ports.users.getUserById(ctx.db, input.toAgent);
		if (!target) {
			return err("NOT_FOUND", `Target agent not found: ${input.toAgent}`);
		}
	}

	const metadata: ToolHandlersHandoffMetadata = {
		context_id: input.contextId,
		status: input.status,
		reason: input.reason,
		artifacts: input.artifacts ?? [],
		remaining_work: input.remainingWork ?? [],
		...(input.error !== undefined ? { error: input.error } : {}),
	};

	const sessionContext: ToolHandlersSessionContext = {
		sessionId: ctx.sessionId,
		agentId: ctx.agentId,
		taskId: ctx.taskId,
		sandboxPath: ctx.sandboxPath,
		ingestion: ctx.ingestion,
		traceId: randomUUID(),
	};

	const params: ToolHandlersHandoffParams = {
		sessionContext,
		metadata,
		...(input.toAgent ? { toAgent: input.toAgent } : {}),
		...(input.toRole ? { toRole: input.toRole } : {}),
		...(input.toHuman ? { toHuman: input.toHuman } : {}),
	};

	const result = await ports.policy.handoff(ctx.db, ctx.eventBus, params);

	return ok({
		status: result.status,
		...(result.targetAgentId ? { targetAgentId: result.targetAgentId } : {}),
		...(result.escalationItemId ? { escalationItemId: result.escalationItemId } : {}),
	});
}

export function createHandoffToTool<TDb>(
	ports: ToolHandlersPorts<TDb>,
): ToolDefinition<HandoffToInput, TDb> {
	return {
		name: "handoff_to",
		description:
			"Hand off the current task to another agent (by ID), to any teammate matching a role, or to a human reviewer. Ends the current session and transfers ownership.",
		inputSchema: handoffToInputSchema,
		handler: (args, ctx) => handler(args, ctx, ports),
	};
}
