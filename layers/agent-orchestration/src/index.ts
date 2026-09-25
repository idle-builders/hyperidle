/**
 * @hyperidle/agent-orchestration — Layer composition barrel.
 *
 * @lore AU19 Increment 0/3: this barrel carried `wiredAssemble`, a
 * context-assembly proof-of-mechanism, until `@hyperidle/run-orchestration`
 * became the real owner of context assembly. It then exported nothing at all —
 * `export {}` — "until a future Increment gives the `agent-orchestration` Layer
 * package itself a real consumer."
 *
 * @lore AU26 B1a: that Increment is this one. The Layer now has its own Hono app
 * and its own boot, and the Application composes both Layers side by side. The
 * barrel exports exactly what an Application needs — never a route module: an
 * Application mounts `boot.app`, and `core-api` may not import a module under
 * `layers/agent-orchestration/**\/routes/**` at all (AC5(a), enforced by
 * `scripts/composition-edge-anti-regrowth-guard.ts`).
 */

export type {
	AgentOrchestrationBoot,
	AgentOrchestrationBootOptions,
	AgentOrchestrationRuntimeOptions,
	ApplicationProvisionSessionDeps,
} from "./boot.js";
export { bootAgentOrchestration } from "./boot.js";
// @lore BC5 T11: the `CoreApiPort` seam's outbound client construction
// (`buildCoreApiPort`/`createInProcessCoreApiTransport`/
// `createNetworkCoreApiTransport`/`unconfiguredCoreApiTransport`/
// `withActorTransport`, `services/core-api-port-composition.ts`) is DELETED
// — `create_team`/`add_agent`, its last two tools, are gone with the `org`
// package they wrote through.
/**
 * The run-orchestration composition — `bootAgent
 * Orchestration`'s own internal consumer. Exposed so a caller with no
 * composition root of its own (`tools/eval`'s `runEvalSession`, which drives
 * `run-orchestration` directly with no HTTP server in the picture) can build
 * the same `runSession`/`startRuntime` pair off its own execution adapters.
 */
export type {
	ProvisionSessionDeps,
	RunOrchestrationComposition,
	RunOrchestrationHarnessRuntimeAdapter,
	RunOrchestrationReturnStatusToolAdapter,
} from "./services/run-orchestration-composition.js";
export { buildRunOrchestrationComposition } from "./services/run-orchestration-composition.js";
// @lore BC5 T11: the tool stack's own composition
// (`buildToolHandlersPorts`/`buildToolDefinitions`,
// `services/tool-handlers-bindings.ts`) is DELETED with the `CoreApiPort`
// seam it wired `@hyperidle/tool-handlers`' domain ports through —
// `create_team`/`add_agent` were its only two tools.
