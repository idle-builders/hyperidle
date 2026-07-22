/**
 * Session provisioning barrel — exported for external consumers (e.g. eval package).
 *
 * @lore X7: This file exists so @hyperidle/eval can import provisioning
 * infrastructure without triggering the server startup in index.ts.
 * The server's main index.ts is a startup script (not a barrel), so
 * deep imports from external packages must use subpath exports.
 */
export {
	AdapterPool,
	LocalSandboxAdapter,
	type SandboxAdapter,
	type SandboxHandle,
} from "@hyperidle/harness-registry";
export type { RunOptions, RunResult } from "@hyperidle/run-orchestration";
export {
	type ProvisionSessionDeps,
	runSession,
} from "./services/run-orchestration-composition.js";
