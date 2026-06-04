/** A scripted tool call the mock harness will execute. */
export interface ScriptedToolCall {
	readonly toolName: string;
	readonly args: Record<string, unknown>;
}

/** A scripted LLM turn: zero or more tool calls, then an optional text completion. */
export interface ScriptedTurn {
	readonly toolCalls: readonly ScriptedToolCall[];
	readonly completion?: string;
	/** Cost delta in dollars for this turn (used to emit cost_update events). */
	readonly costDelta?: number;
}

/** The script the mock harness replays. */
export interface HarnessScript {
	readonly turns: readonly ScriptedTurn[];
}

/** Seed data for an eval scenario's world state. */
export interface EvalSeedData {
	readonly team: {
		readonly id: string;
		readonly name: string;
	};
	readonly teamMember: {
		readonly id: string;
	};
	readonly agents: readonly {
		readonly id: string;
		readonly name: string;
		readonly role: string;
		readonly soulPrompt?: string;
		readonly costCapMinor?: number;
	}[];
	readonly bet: {
		readonly id: string;
		readonly description: string;
		readonly costAppetiteMinor?: number;
	};
	readonly tasks: readonly {
		readonly id: string;
		readonly title: string;
		readonly description?: string;
		readonly state: string;
		readonly ownerAgentId?: string;
	}[];
	readonly knowledgeItems?: readonly {
		readonly id: string;
		readonly title: string;
		readonly body: string;
		readonly scopeKind?: string;
		readonly scopeId?: string;
	}[];
}

/** Which agent and task triggers the session. */
export interface EvalTrigger {
	readonly agentId: string;
	readonly taskId: string;
	/** Override model tier for this scenario. */
	readonly modelTier?: import("@hyperidle/shared").ModelTier;
}

/** A single eval scenario. */
export interface EvalScenario {
	/** Unique scenario identifier (e.g., "knowledge-task"). */
	readonly id: string;
	/** Human-readable scenario name. */
	readonly name: string;
	/** Description of what this scenario tests. */
	readonly description: string;
	/** Seed data inserted before the session runs. */
	readonly seed: EvalSeedData;
	/** Which agent/task triggers the session. */
	readonly trigger: EvalTrigger;
	/** The scripted harness responses (mock mode only). */
	readonly script: HarnessScript;
	/** Assert expected outcomes against the DB after session completes. */
	readonly assert: (ctx: AssertionContext) => Promise<void>;
}

/** Context passed to the scenario's assert function. */
export interface AssertionContext {
	readonly db: import("@hyperidle/db").HyperIdleDb;
	readonly sessionResult: import("@hyperidle/server/session").ProvisionSessionResult;
	readonly events: readonly import("@hyperidle/shared").HarnessEvent[];
}

/** Result of a single scenario run. */
export interface EvalScenarioResult {
	readonly scenarioId: string;
	readonly scenarioName: string;
	readonly passed: boolean;
	readonly durationMs: number;
	readonly costCents: number;
	readonly mode: "mock" | "live";
	readonly failure?: {
		readonly message: string;
		readonly stack?: string;
	};
}

/** The full eval report. */
export interface EvalReport {
	readonly timestamp: string;
	readonly mode: "mock" | "live";
	readonly scenarios: readonly EvalScenarioResult[];
	readonly summary: {
		readonly total: number;
		readonly passed: number;
		readonly failed: number;
		readonly totalDurationMs: number;
		readonly totalCostCents: number;
	};
}
