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
// @lore: createWritebackProcessor public — e2e test needs process/subscribe wired to @hyperidle/document; forbidden here; test lives where both imports are legal
export { createWritebackProcessor } from "./writeback-processor.js";
