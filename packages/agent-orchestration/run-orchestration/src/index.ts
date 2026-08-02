// AU21 §9 Increment 8 (Decision F2, historical): the session-launch-time
// provisioning OPERATION relocated here from core-api's
// `connections`/`filesystems` Services.
//
// AU21 §9 Increment 12 follow-up (+ part 2): both `SessionLifecyclePorts
// ["filesystems"]` and `["connections"]` seam ports are DELETED entirely —
// the agent's injected filesystems/held connections are baked at EMIT time
// onto the request instead (`@hyperidle/filesystems`'s
// `resolveInjectedFilesystemsForAgent` / `@hyperidle/connections`'s
// `resolveInjectedConnectionsForAgent`). `buildProvisioningPlan`/
// `applyProvisioningPlan` are called directly by this package's own
// `provisioner.ts` — no composition-root port wiring needed.

export { isAgentAtCapacity } from "./concurrency.js";
export {
	applyProvisioningPlan,
	buildProvisioningPlan,
	type HeldConnectionForProvisioning,
	type HeldConnectionsForProvisioning,
	type ProvisioningPlan,
	type ServiceConnectionResolverPort,
} from "./connection-provisioning.js";
export type {
	AgentTerminationReason,
	RunOptions,
	RunResult,
	RunTransitionResult,
	RunTransitionSpec,
	RuntimeDeps,
	RuntimeHandle,
	RuntimePorts,
} from "./contracts.js";
export type { FileWatcher, FileWatcherConfig } from "./file-watcher.js";
export { startWatcher } from "./file-watcher.js";
export {
	type FilesystemForProvisioning,
	mountFilesystemsForAgent,
} from "./filesystem-provisioning.js";
export { runSession } from "./runtime.js";
export { startRuntime } from "./start-runtime.js";
export { transitionRun } from "./transition-run.js";
