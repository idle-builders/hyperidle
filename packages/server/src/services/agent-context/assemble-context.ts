import type { HyperIdleDb } from "@hyperidle/db";
import type { IngestionHandle, UserRole } from "@hyperidle/shared";
import { assembleContext } from "../../app-runtime/context-assembly.js";
import { startWatcher } from "../../app-runtime/file-watcher.js";

export interface AssembleAgentContextInput {
	readonly db: HyperIdleDb;
	readonly sandboxPath: string;
	readonly sessionId: string;
	readonly taskId: string | null;
	readonly agentId: string;
	readonly agentRole: UserRole;
	readonly teamId: string | null;
	readonly isRoutine: boolean;
}

export interface AgentContextAssemblyOutcome {
	readonly itemCount: number;
	readonly durationMs: number;
	readonly manifestPath: string;
}

export interface AgentWritebackHandle {
	dispose(): void;
}

export async function assembleAgentContext(
	input: AssembleAgentContextInput,
): Promise<AgentContextAssemblyOutcome> {
	if (!input.taskId) {
		return {
			itemCount: 0,
			durationMs: 0,
			manifestPath: `${input.sandboxPath}/.fabric/manifest.json`,
		};
	}
	const result = await assembleContext(input.db, {
		sandboxPath: input.sandboxPath,
		sessionId: input.sessionId,
		taskId: input.taskId,
		agentId: input.agentId,
		agentRole: input.agentRole,
		productId: input.teamId ?? "task-free",
	});
	return {
		itemCount: result.itemCount,
		durationMs: result.durationMs,
		manifestPath: `${input.sandboxPath}/.fabric/manifest.json`,
	};
}

export function beginAgentWriteback(input: {
	readonly db: HyperIdleDb;
	readonly sandboxPath: string;
	readonly sessionId: string;
	readonly manifestPath: string;
}): IngestionHandle & AgentWritebackHandle {
	const watcher = startWatcher(input);
	return {
		dispose: () => watcher.stop(),
	};
}
