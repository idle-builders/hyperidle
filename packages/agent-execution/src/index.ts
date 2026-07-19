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
 * Nothing consumes this Layer barrel yet — the `desktop`/`remote-worker`
 * Application bootstraps that compose it are Increment 5's own item.
 */

export {
	AdapterPool,
	checkCliHarnessAvailability,
	createHarnessAdapter,
	createLocalAdapterPool,
	createRemoteHarnessAdapter,
	LocalSandboxAdapter,
} from "@hyperidle/harness-registry";
