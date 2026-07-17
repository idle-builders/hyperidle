/**
 * `context-assembly` Service — the bound-ops factory.
 *
 * @lore AU19 Increment 3 (finalize): every impure entry point across this
 * Service's files takes an explicit `ContextAssemblyPorts` parameter
 * (Mechanism C DI). But this Service's real downstream consumers
 * (`packages/server`'s `context-assembly-bindings.ts`, which
 * `session-lifecycle-bindings.ts` and `__tests__/R7-knowledge-e2e.
 * integration.test.ts` import from) expect the ORIGINAL, ports-free call
 * signatures the flat `packages/server/src/services/context-assembly*.ts`
 * files exposed — same idiom as `dispatch`'s `createDispatchOps`/`cost`'s
 * `createCostOps`: `createContextAssemblyOps` closes over
 * `ContextAssemblyPorts` ONCE, at the composition root, and returns bound
 * functions whose signatures exactly match what every downstream caller
 * already expects — a mechanical wiring swap, zero behavior change.
 *
 * `composeAssistantPrompt`/`writeSandboxAgentsMd`/`stripFrontmatter`/
 * `substituteTemplateVars`/`buildTemplateVariables` are pure (no ports) —
 * re-exported directly from `index.ts` as well as bound here (for a uniform
 * `ContextAssemblyOps` surface matching `session-lifecycle`'s
 * `SessionLifecycleContextAssembly` port 1:1).
 */
import type { HyperIdleDb } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/shared";
import type {
	AgentContextAssemblyOutcome,
	AgentWritebackHandle,
	AssembleAgentContextInput,
} from "./assemble-context.js";
import { assembleAgentContext, beginAgentWriteback } from "./assemble-context.js";
import type { ContextAssemblyConfig, ContextAssemblyResult } from "./context-assembly.js";
import { assembleContext } from "./context-assembly.js";
import type {
	AssistantPromptResult,
	PromptCompositionInput,
	PromptCompositionResult,
	RoutinePromptCompositionInput,
} from "./context-assembly-prompt.js";
import {
	assemblePrompt,
	assembleRoutinePrompt,
	composeAssistantPrompt,
	writeSandboxAgentsMd,
} from "./context-assembly-prompt.js";
import type { ContextAssemblyPorts } from "./ports.js";
import type {
	RoutineSessionContextConfig,
	RoutineSessionContextData,
	SessionContextConfig,
	SessionContextData,
} from "./session-context.js";
import {
	buildRoutineSessionContextData,
	buildSessionContext,
	buildSessionContextData,
} from "./session-context.js";

/** The deps-free surface this Service's downstream callers expect. */
export interface ContextAssemblyOps {
	assembleContext(db: HyperIdleDb, config: ContextAssemblyConfig): Promise<ContextAssemblyResult>;
	assembleAgentContext(input: AssembleAgentContextInput): Promise<AgentContextAssemblyOutcome>;
	beginAgentWriteback(input: {
		readonly sandboxPath: string;
		readonly sessionId: string;
		readonly manifestPath: string;
		readonly eventBus: EventBus;
	}): AgentWritebackHandle;
	buildSessionContextData(
		db: HyperIdleDb,
		config: SessionContextConfig,
		/** I0c: optional pre-fetched agent — skips the getUserById call when supplied. */
		preloadedAgent?: { id: string; name: string; role: string },
	): Promise<SessionContextData>;
	buildRoutineSessionContextData(
		db: HyperIdleDb,
		config: RoutineSessionContextConfig,
	): Promise<RoutineSessionContextData>;
	buildSessionContext(db: HyperIdleDb, config: SessionContextConfig): Promise<string>;
	assemblePrompt(input: PromptCompositionInput): Promise<PromptCompositionResult>;
	assembleRoutinePrompt(input: RoutinePromptCompositionInput): Promise<PromptCompositionResult>;
	composeAssistantPrompt(systemPromptText: string): AssistantPromptResult;
	writeSandboxAgentsMd(sandboxPath: string, assembledPrompt: string): void;
}

/** Bind this Service's ports-taking functions to a single `ContextAssemblyPorts` instance. */
export function createContextAssemblyOps(ports: ContextAssemblyPorts): ContextAssemblyOps {
	return {
		assembleContext: (db, config) => assembleContext(db, config, ports),
		assembleAgentContext: (input) => assembleAgentContext(input, ports),
		beginAgentWriteback: (input) => beginAgentWriteback(input, ports),
		buildSessionContextData: (db, config, preloadedAgent) =>
			buildSessionContextData(db, config, ports, preloadedAgent),
		buildRoutineSessionContextData: (db, config) =>
			buildRoutineSessionContextData(db, config, ports),
		buildSessionContext: (db, config) => buildSessionContext(db, config, ports),
		assemblePrompt: (input) => assemblePrompt(input, ports),
		assembleRoutinePrompt: (input) => assembleRoutinePrompt(input, ports),
		composeAssistantPrompt,
		writeSandboxAgentsMd,
	};
}
