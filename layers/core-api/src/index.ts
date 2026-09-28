/**
 * @lore: core-api barrel — never re-export a service by name; wrap in a function this package owns (laundering shape creates unowned surface)
 */

export { createStandaloneSearchDocuments } from "./actions/compose.js";
export { installBundledPlugin, teamPluginAgentId } from "./actions/install-bundled-plugin.js";
export { applyFactoryCoreState } from "./bootstrap/factory-state.js";
export type {
	ComposeApiApplicationOptions,
	ComposedApiMiddleware,
} from "./compose-api-application.js";
export { composeApiApplication } from "./compose-api-application.js";
export { health } from "./routes/health.js";
export {
	DEFAULT_REAPER_STALE_AFTER_MS,
	registerAgentLayerServices,
	registerCoreDomainServices,
} from "./service-bootstrap.js";
export {
	buildAgentOrchestrationPort,
	buildSeamBackedReviewVerdictRecorder,
	buildSeamBackedWorkIntentRecorder,
	createInProcessAgentOrchestrationTransport,
	createNetworkAgentOrchestrationTransport,
} from "./services/agent-orchestration-port-composition.js";
