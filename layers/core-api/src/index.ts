export { createStandaloneSearchDocuments } from "./actions/compose.js";
export {
	installPluginOutsideServer,
	pluginAgentId,
} from "./actions/install-plugin-outside-server.js";
export { applyFactoryCoreState } from "./bootstrap/factory-state.js";
export type {
	ComposeApiApplicationOptions,
	ComposedApiMiddleware,
} from "./compose-api-application.js";
export { composeApiApplication } from "./compose-api-application.js";
export { installedPluginsDir } from "./installed-plugins-dir.js";
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
