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

export type {
	AgentRunConfig,
	AgentRunConfigPatch,
} from "./agent-run-config-store.js";
export {
	DEFAULT_AGENT_RUN_CONFIG,
	readAgentRunConfig,
	readAgentRunConfigs,
	writeAgentRunConfig,
} from "./agent-run-config-store.js";
export {
	applyProvisioningPlan,
	buildProvisioningPlan,
	type HeldConnectionForProvisioning,
	type HeldConnectionsReaderPort,
	// @lore AU44 batch6: ProvisioningPlan removed from barrel — file-local per
	// the lore in connection-provisioning.ts. No cross-package consumer.
	type ServiceConnectionResolverPort,
} from "./connection-provisioning.js";
export type {
	AdmittedRun,
	HarnessPort,
	HarnessPortDeps,
	HarnessRunOutput,
	RunContextBundle,
	RunOptions,
	RunResult,
	RunTransitionSpec,
	RuntimeDeps,
	RuntimeHandle,
	RuntimePorts,
} from "./contracts.js";
export { endRunForHandoff } from "./end-run-for-handoff.js";
export { startWatcher } from "./file-watcher.js";
export {
	type FilesystemForProvisioning,
	type InjectedFilesystemsReaderPort,
	mountFilesystemsForAgent,
} from "./filesystem-provisioning.js";
export { RegistryFilesystemMounter } from "./mounter.js";
export type { MountingGitRunnerFactory } from "./mounter-ports.js";
export type { PluginMcpContributionsPort } from "./provisioner.js";
export {
	requestRunStopForTasks,
	type StoppedRun,
} from "./request-run-stop-for-tasks.js";
export { runSession } from "./runtime.js";
export { SANDBOX_SCAFFOLDING_PATHS } from "./scaffolding-paths.js";
// -- `sessions`: this Service owns the table, so these are its only doors --
export {
	countActiveRunsByAgent,
	endSessionByCas,
	findSessionById,
	listLatestOutcomeByTask,
	listRunSummaries,
	listSessions,
	writeSessionNotes,
} from "./session-store.js";
export { startRuntime } from "./start-runtime.js";
export { transitionRun } from "./transition-run.js";
