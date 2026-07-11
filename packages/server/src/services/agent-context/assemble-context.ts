import * as fs from "node:fs";
import * as path from "node:path";
import type { HyperIdleDb } from "@hyperidle/db";
import type {
	AgentSessionSourceCorrelation,
	AgentSessionSourceKind,
	UserRole,
} from "@hyperidle/shared";
import { assembleContext } from "../context-assembly.js";
import type { IngestionHandle } from "../contracts.js";
import { startWatcher } from "../file-watcher.js";

export interface AssembleAgentContextInput {
	readonly db: HyperIdleDb;
	readonly sandboxPath: string;
	readonly sessionId: string;
	readonly taskId: string | null;
	readonly agentId: string;
	readonly agentRole: UserRole;
	readonly teamId: string | null;
	readonly isRoutine: boolean;
	readonly sourceKind: AgentSessionSourceKind | null;
	readonly sourceId: string | null;
	readonly sourceCorrelation: AgentSessionSourceCorrelation | null;
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
	const manifestPath = path.join(input.sandboxPath, ".fabric/manifest.json");
	if (!input.taskId) {
		fs.mkdirSync(path.join(input.sandboxPath, ".fabric"), { recursive: true });
		fs.mkdirSync(path.join(input.sandboxPath, "context"), { recursive: true });
		fs.writeFileSync(
			path.join(input.sandboxPath, "context/session.toon"),
			[
				`session_id: ${input.sessionId}`,
				`source_kind: ${input.sourceKind ?? "task-free"}`,
				`source_id: ${input.sourceId ?? ""}`,
				`agent_id: ${input.agentId}`,
				`team_id: ${input.teamId ?? ""}`,
				`correlation_json: ${JSON.stringify(input.sourceCorrelation ?? {})}`,
			].join("\n"),
		);
		fs.writeFileSync(
			manifestPath,
			JSON.stringify(
				{
					session_id: input.sessionId,
					assembled_at: new Date().toISOString(),
					items: {},
				},
				null,
				2,
			),
		);
		return {
			itemCount: 0,
			durationMs: 0,
			manifestPath,
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
		manifestPath,
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
