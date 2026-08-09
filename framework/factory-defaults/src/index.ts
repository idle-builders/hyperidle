export type { AgentScaffoldRequest, AgentScaffoldSpec } from "./agent-scaffold.js";
export { resolveAgentScaffoldSpecs } from "./agent-scaffold.js";
export type {
	FactoryAgentRef,
	FactoryFacilitatorSpec,
	FactoryRosterSpec,
	FactorySystemAssistantSpec,
} from "./factory-roster.js";
export { COMMUNITY_DISPLAY_NAMES, defaultFactoryRoster } from "./factory-roster.js";
export {
	readSystemPromptTemplateForRole,
	SYSTEM_PROMPT_TEMPLATE_FILES,
} from "./system-prompt-templates.js";
