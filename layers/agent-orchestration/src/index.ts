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
} from "./boot.js";
export { bootAgentOrchestration } from "./boot.js";
