/**
 * Barrel for @hyperidle/context-assembly (agent-orchestration Layer Service).
 *
 * Depends on NO other Service (Mechanism C): every domain read (`knowledge`/
 * `work`/`users`/`routine`/`filesystems`) arrives as an injected `ContextAssemblyPorts`
 * port, wired by the composition root (`packages/server/src/services/
 * context-assembly-bindings.ts`) to the real migrated `@hyperidle/knowledge`/
 * `@hyperidle/work`/`@hyperidle/users`/`@hyperidle/routine`/`@hyperidle/filesystems`
 * packages.
 *
 * @lore AU19 Increment 0: this package started as a minimal proof-of-mechanism
 * slice — a generic `assemble(ports, scope, authorId)` with the `knowledge`
 * port wired to the real `@hyperidle/knowledge` Service and the other four
 * ports wired to explicit transitional stubs (never on a production path).
 * @lore AU19 Increment 3 (finalize): the Increment-0 proof scaffold
 * (`assemble.ts`) is RETIRED — this is the real cut-over. The actual
 * `assembleContext`/`assemblePrompt`/`assembleRoutinePrompt`/
 * `composeAssistantPrompt`/`buildSessionContext`/`assembleAgentContext`/
 * `beginAgentWriteback` logic moved here unchanged (behavior-preserving)
 * from `packages/server/src/services/{context-assembly.ts,
 * context-assembly-prompt.ts, session-context.ts,
 * agent-context/assemble-context.ts}`, with all five domain reads now real
 * DI ports (`ContextAssemblyPorts` in `ports.ts`) instead of direct
 * `@hyperidle/*` imports or transitional stubs. `createContextAssemblyOps`
 * (`service.ts`) binds a single `ContextAssemblyPorts` instance once, at the
 * composition root, and every real call site imports the bound singleton —
 * same idiom as `dispatch`/`cost`/`agent-selection`.
 */

// -- assemble-context (agent session context assembly + writeback) --
export type {
	AgentContextAssemblyOutcome,
	AgentWritebackHandle,
	AssembleAgentContextInput,
} from "./assemble-context.js";
// -- context-assembly (knowledge-budget sandbox assembly) --
export type {
	ContextAssemblyConfig,
	ContextAssemblyResult,
	Manifest,
	ManifestEntry,
} from "./context-assembly.js";
export { EMITTED_ROOTS_CONTEXT_ASSEMBLY } from "./context-assembly.js";
// -- context-assembly-prompt (persona/task/tools prompt composition) --
export type {
	AssistantPromptResult,
	PromptCompositionInput,
	PromptCompositionResult,
	RoutinePromptCompositionInput,
	ToolSummary,
} from "./context-assembly-prompt.js";
export {
	buildTemplateVariables,
	EMITTED_ROOTS_AGENTS_MD,
	stripFrontmatter,
	substituteTemplateVars,
} from "./context-assembly-prompt.js";
// -- ports (Mechanism C — DI-injected outbound edges) --
export type {
	ContextAssemblyFileWatcher,
	ContextAssemblyFileWatcherConfig,
	ContextAssemblyKnowledgeListFilters,
	ContextAssemblyPorts,
	ContextAssemblyScoringContext,
	FilesystemsReader,
	KnowledgeReader,
	RoutineReader,
	UsersReader,
	WorkReader,
} from "./ports.js";
// -- service (bound-ops factory — the composition root's real entry point) --
export type { ContextAssemblyOps } from "./service.js";
export { createContextAssemblyOps } from "./service.js";
// -- session-context (task/routine session context data + session.toon) --
export type {
	RoutineSessionContextConfig,
	RoutineSessionContextData,
	SessionContextConfig,
	SessionContextData,
} from "./session-context.js";
