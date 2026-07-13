/**
 * Session provisioning barrel — exported for external consumers (e.g. eval package).
 *
 * @lore X7: This file exists so @hyperidle/eval can import provisioning
 * infrastructure without triggering the server startup in index.ts.
 * The server's main index.ts is a startup script (not a barrel), so
 * deep imports from external packages must use subpath exports.
 */
export { AdapterPool } from "@hyperidle/agent-layer";
export { LocalSandboxAdapter } from "@hyperidle/agent-layer";
export type { SandboxAdapter, SandboxHandle } from "@hyperidle/agent-layer";
export {
	type ProvisionSessionDeps,
	type ProvisionSessionParams,
	type ProvisionSessionResult,
	provisionSession,
} from "@hyperidle/agent-layer";
