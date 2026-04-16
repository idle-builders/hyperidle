import { agents } from "@hyperidle/db";
import type { FileWatcher } from "@hyperidle/fabric";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { type HandoffMetadata, type HandoffParams, handoff } from "../services/handoff-protocol.js";
import type { SessionContext } from "../services/session-lifecycle.js";
import type { ToolContext, ToolDefinition } from "./tool-registry.js";
import { type ToolResult, err, ok } from "./tool-result.js";

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

/**
 * No-op file watcher used to satisfy the SessionContext shape required by the
 * handoff protocol. The real watcher is owned by the session provisioner
 * (D5) and will be passed in via a richer context once that lands.
 */
const NOOP_WATCHER: FileWatcher = { stop: (): void => {} };

async function handler(args: HandoffToInput, ctx: ToolContext): Promise<ToolResult> {
	const parsed = handoffToInputSchema.safeParse(args);
	if (!parsed.success) {
		return err("INVALID_INPUT", parsed.error.message);
	}
	const input = parsed.data;

	if (!input.toAgent && !input.toRole && !input.toHuman) {
		return err("INVALID_INPUT", "One of toAgent, toRole, or toHuman must be specified");
	}

	// Pre-validate target agent so we can return a structured NOT_FOUND
	// instead of letting the service throw.
	if (input.toAgent) {
		const target = ctx.db.select().from(agents).where(eq(agents.id, input.toAgent)).get();
		if (!target) {
			return err("NOT_FOUND", `Target agent not found: ${input.toAgent}`);
		}
	}

	const metadata: HandoffMetadata = {
		context_id: input.contextId,
		status: input.status,
		reason: input.reason,
		artifacts: input.artifacts ?? [],
		remaining_work: input.remainingWork ?? [],
		...(input.error !== undefined ? { error: input.error } : {}),
	};

	const sessionContext: SessionContext = {
		sessionId: ctx.sessionId,
		agentId: ctx.agentId,
		taskId: ctx.taskId,
		workspacePath: ctx.workspacePath,
		watcher: NOOP_WATCHER,
	};

	const params: HandoffParams = {
		sessionContext,
		metadata,
		...(input.toAgent ? { toAgent: input.toAgent } : {}),
		...(input.toRole ? { toRole: input.toRole } : {}),
		...(input.toHuman ? { toHuman: input.toHuman } : {}),
	};

	const result = await handoff(ctx.db, ctx.eventBus, params);

	return ok({
		status: result.status,
		...(result.targetAgentId ? { targetAgentId: result.targetAgentId } : {}),
		...(result.escalationItemId ? { escalationItemId: result.escalationItemId } : {}),
	});
}

export const handoffToTool: ToolDefinition<HandoffToInput> = {
	name: "handoff_to",
	description:
		"Hand off the current task to another agent (by ID), to any teammate matching a role, or to a human reviewer. Ends the current session and transfers ownership.",
	inputSchema: handoffToInputSchema,
	handler,
};
