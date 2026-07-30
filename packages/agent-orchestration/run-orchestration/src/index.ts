// AU21 §9 Increment 8 (Decision F2): the session-launch-time provisioning
// OPERATION relocated here from core-api's `connections`/`filesystems`
// Services — the composition root (`core-api`'s
// `run-orchestration-composition.ts`) wires these real implementations to
// the `SessionLifecyclePorts["connections"]`/`["filesystems"]` seam ports.
export {
	applyProvisioningPlan,
	buildProvisioningPlan,
	type ConnectionsProvisioningReader,
	type HeldConnectionForProvisioning,
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
	type FilesystemsProvisioningReader,
	mountFilesystemsForAgent,
} from "./filesystem-provisioning.js";
export { runSession } from "./runtime.js";
export { startRuntime } from "./start-runtime.js";
export { transitionRun } from "./transition-run.js";
