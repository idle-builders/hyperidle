/** Patch shape for the runner's agent run-config route. */
export type AgentOrchestrationRunConfigPatch = {
	readonly modelId?: string | null;
	readonly modelProvider?: string | null;
	readonly maxConcurrentSessions?: number;
	readonly modelOptions?: Record<string, string | number | boolean>;
	readonly login?: "own" | "owner";
	readonly spacePath?: string | null;
};

/** Input shape for the runner's connection-create route. */
export type AgentOrchestrationConnectionCreateInput =
	| { readonly service: string; readonly authSource: "token"; readonly token: string }
	| { readonly service?: string; readonly authSource: "mcp"; readonly serverUrl: string };
