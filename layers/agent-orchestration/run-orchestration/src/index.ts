// The session-launch-time
// provisioning OPERATION relocated here from core-api's
// `connections`/`filesystems` Services.
//
// Follow-up (+ part 2): both `SessionLifecyclePorts
// ["filesystems"]` and `["connections"]` seam ports were DELETED entirely —
// the agent's injected filesystems/held connections were baked at EMIT time
// onto the request instead.
//
// The connections half of that bake is now gone too. Held connections
// are read LIVE at spawn through `HeldConnectionsReaderPort`, backed by
// `@hyperidle/connections` — this Layer's own table, so this is not a seam.
// A port rather than a direct import because `run-orchestration` is itself a
// Service (Mechanism C); the Application wires the two.
//
// And now the filesystems half as well —
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
export { createContextAssembler } from "./context.js";
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
export { ensureSandboxGitRepo, RegistryFilesystemMounter } from "./mounter.js";
export type { MountingGitRunnerFactory } from "./mounter-ports.js";
export type { PluginMcpContributionsPort } from "./provisioner.js";
export {
	requestRunStopForTasks,
	type StoppedRun,
} from "./request-run-stop-for-tasks.js";
export {
	findReviewSession,
	type ResumeIntentEnqueuer,
	type ReviewSessionLink,
	recordReviewSession,
	recordReviewVerdict,
} from "./review-sessions.js";
export { runSession } from "./runtime.js";
export { SANDBOX_SCAFFOLDING_PATHS } from "./scaffolding-paths.js";
export {
	type Action as SessionAction,
	type ActionContext as SessionActionContext,
	createSessionActions,
	type SessionActionsDeps,
} from "./session-actions.js";
// -- `sessions`: this Service owns the table, so these are its only doors --
export {
	endSessionByCas,
	findSessionById,
	listSessions,
	type SessionSearchFilter,
	stopSessionRun,
	writeSessionNotes,
} from "./session-store.js";
export { startRuntime } from "./start-runtime.js";
export { transitionRun } from "./transition-run.js";
/**
 * @lore nested-knowledge-items (review.md B7): the writeback processor was
 * only reachable from a test *inside* this package, via a relative import —
 * `startRuntime` (already public) is the only production caller and it
 * calls `createWritebackProcessor().subscribe(...)` internally as one line.
 * A true end-to-end test needs `process`/`subscribe` directly, wired to the
 * REAL document repository (`@hyperidle/document`) — which this package
 * may not import (the agent-orchestration -> core-api edge AU26 B1a
 * forbids). That test can only live where BOTH are legal to import
 * (core-api's own test directory), so the factory itself must be public.
 */
export { createWritebackProcessor } from "./writeback-processor.js";
