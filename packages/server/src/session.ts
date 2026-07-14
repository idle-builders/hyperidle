/**
 * Session provisioning barrel — exported for external consumers (e.g. eval package).
 *
 * @lore X7: This file exists so @hyperidle/eval can import provisioning
 * infrastructure without triggering the server startup in index.ts.
 * The server's main index.ts is a startup script (not a barrel), so
 * deep imports from external packages must use subpath exports.
 */
export { AdapterPool } from "./harness/adapter-pool.js";
export { LocalSandboxAdapter } from "./harness/local-sandbox-adapter.js";
export type { SandboxAdapter, SandboxHandle } from "./harness/sandbox-adapter.js";
export {
	type ProvisionSessionDeps,
	type ProvisionSessionParams,
	type ProvisionSessionResult,
	provisionSession,
} from "./services/session-lifecycle-bindings.js";
