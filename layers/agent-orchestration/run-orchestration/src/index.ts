// AU21 §9 Increment 8 (Decision F2, historical): the session-launch-time
// provisioning OPERATION relocated here from core-api's
// `connections`/`filesystems` Services.
//
// AU21 §9 Increment 12 follow-up (+ part 2): both `SessionLifecyclePorts
// ["filesystems"]` and `["connections"]` seam ports were DELETED entirely —
// the agent's injected filesystems/held connections were baked at EMIT time
// onto the request instead.
//
// AU26 E3: the connections half of that bake is now gone too. Held connections
// are read LIVE at spawn through `HeldConnectionsReaderPort`, backed by
// `@hyperidle/connections` — this Layer's own table, so this is not a seam.
// A port rather than a direct import because `run-orchestration` is itself a
// Service (Mechanism C); the Application wires the two.
//
// AU26 F2: and now the filesystems half as well —
// `InjectedFilesystemsReaderPort`, backed by `@hyperidle/filesystems`, same
// shape and same reasoning. NOTHING about connections or filesystems rides an
// emitted request any more.

export {
	applyProvisioningPlan,
	buildProvisioningPlan,
	type HeldConnectionForProvisioning,
	type HeldConnectionsReaderPort,
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
export { type CreateBareRunInput, createBareRun } from "./create-bare-run.js";
export { endRunForHandoff } from "./end-run-for-handoff.js";
export type { FileWatcher, FileWatcherConfig } from "./file-watcher.js";
export { startWatcher } from "./file-watcher.js";
export {
	type FilesystemForProvisioning,
	type InjectedFilesystemsReaderPort,
	mountFilesystemsForAgent,
} from "./filesystem-provisioning.js";
export {
	requestRunStopForTasks,
	type StoppedRun,
} from "./request-run-stop-for-tasks.js";
export { runSession } from "./runtime.js";
export { startRuntime } from "./start-runtime.js";
export { transitionRun } from "./transition-run.js";
