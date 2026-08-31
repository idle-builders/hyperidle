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
// AU29 §2.5.3: the first-boot run-config face — the composition roots call this
// AFTER core-api's applyFactoryCoreState (agent_run_config.agentUserId has an FK
// to users.id), instead of a database package writing an orchestration-owned table.
/**
 * AU31 §2.5/§5/§12: the `CoreApiPort` seam's outbound client construction —
 * relocated here from core-api with the tool stack that is its real
 * consumer (`buildRunOrchestrationComposition`, `services/run-orchestration-
 * composition.ts`). `applications/remote-server/src/create-server.ts` needs
 * `createInProcessCoreApiTransport`/`createNetworkCoreApiTransport` directly
 * to build the value it hands into `bootAgentOrchestration`'s `runtime.
 * coreApiTransport` option (§3.2 clause 4's construction-cycle pattern); the
 * rest of this group has the same real production consumer inside this
 * package's own boot and is exposed at the same face for that reason, not
 * only because tests reuse it too.
 */
export {
	buildCoreApiPort,
	createInProcessCoreApiTransport,
	createNetworkCoreApiTransport,
	unconfiguredCoreApiTransport,
	withActorTransport,
} from "./services/core-api-port-composition.js";
/**
 * AU31 §2.1(b)/§2.3/§5/§6: the run-orchestration composition — `bootAgent
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
/**
 * AU31 §2.5: the tool stack's own composition — `buildToolHandlersPorts`/
 * `buildToolDefinitions` wire `@hyperidle/tool-handlers`' domain ports to a
 * `CoreApiTransport` value. `buildRunOrchestrationComposition`'s own
 * `toolProvider` is this package's real production consumer; exposed here so
 * a caller building a dispatch against a real app (service-lane tests,
 * `tools/eval`) reaches the SAME wiring production uses instead of a
 * hand-rolled duplicate.
 */
export { buildToolDefinitions, buildToolHandlersPorts } from "./services/tool-handlers-bindings.js";
