/**
 * @hyperidle/agent-execution — Layer composition barrel.
 *
 * The execution Layer composes harness/LLM/MCP/tool Service packages. It holds
 * ZERO domain-Service or DB reference (Mechanism B): it receives an assembled
 * context bundle and returns raw output. Its dependencies are framework packages
 * plus its own execution Services — never `@hyperidle/db`.
 *
 * @lore AU31 §6/AC #4: the Increment-4-era re-export barrel (`AdapterPool`,
 * `createHarnessAdapter`, `createLocalAdapterPool`, `createSandboxAdapter`
 * re-exported straight from `@hyperidle/harness-registry`) is replaced by a
 * genuine boot, `bootAgentExecution` (`./boot.js`) — the face clause-2
 * violation `requirements.md` §3.5 named. Those four symbols had zero
 * consumers through this face (every real call site imported
 * `@hyperidle/harness-registry` directly instead — `applications/remote-server/
 * src/index.ts`, `applications/desktop/src/boot-server.ts`,
 * `applications/remote-server/src/create-server.ts`,
 * `layers/core-api/src/services/run-orchestration-composition.ts`), so
 * dropping the re-export strands nothing; those call sites move onto this
 * boot as architecture §5/§5.3 relocate them (wave B, later leaves).
 *
 * @lore AU31 §2.7/[P9]: `RemoteWorkerClient` relocated here from
 * `applications/remote-worker` — the class self-describes as this Layer's
 * content (holds a `HarnessAdapter`, depends only on `@hyperidle/shared`,
 * never touches `core-api`/`agent-orchestration`/`core-ui`). `desktop`
 * imports it from this face now, not from the `remote-worker` Application
 * (closes the `application → application [import]` crossing); `remote-worker`
 * thins to a re-export of this face (§5.3).
 */

export type {
	AgentExecutionAdapters,
	AgentExecutionBoot,
	AgentExecutionBootOptions,
	AgentExecutionHarnessRuntime,
	DeniedAction,
} from "./boot.js";
export { bootAgentExecution } from "./boot.js";
export {
	RemoteWorkerClient,
	type RemoteWorkerClientOptions,
	type WorkerStatus,
} from "./remote-worker-client.js";
