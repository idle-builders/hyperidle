/**
 * @hyperidle/agent-execution — Layer composition barrel.
 *
 * The execution Layer composes harness/LLM/MCP/tool Service packages. It holds
 * ZERO domain-Service or DB reference (Mechanism B): it receives an assembled
 * context bundle and returns raw output. Its dependencies are `@hyperidle/shared`
 * plus its own execution Services — never `@hyperidle/db`.
 *
 * @lore AU19 Increment 4: re-exports `harness-registry`'s real Service
 * surface now that it is finalized (was the Increment-0 single-file proof).
 *
 * @lore AU31 §2.7/[P9]: `RemoteWorkerClient` relocated here from
 * `applications/remote-worker` — the class self-describes as this Layer's
 * content (holds a `HarnessAdapter`, depends only on `@hyperidle/shared`,
 * never touches `core-api`/`agent-orchestration`/`core-ui`). `desktop`
 * imports it from this face now, not from the `remote-worker` Application
 * (closes the `application → application [import]` crossing); `remote-worker`
 * thins to a re-export of this face (§5.3).
 */

export {
	AdapterPool,
	createHarnessAdapter,
	createLocalAdapterPool,
	createSandboxAdapter,
} from "@hyperidle/harness-registry";
export {
	RemoteWorkerClient,
	type RemoteWorkerClientOptions,
	type WorkerStatus,
} from "./remote-worker-client.js";
