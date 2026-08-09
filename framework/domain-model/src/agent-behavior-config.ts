export type AgentBehaviorConfigKind = "agent" | "skill" | "routine" | "trigger" | "tool" | "mcp";
export type AgentBehaviorOriginType = "builtin" | "plugin" | "user";
export type AgentBehaviorOriginState = "enabled" | "disabled" | "removed" | "user_owned";
export type AgentBehaviorValueSource = "default" | "user_override" | "user_owned" | "fallback";
export type AgentBehaviorPromptSource = "none" | "trigger" | "agent_default";
export type AgentBehaviorFieldKind = "text" | "textarea" | "select" | "toggle" | "url";
export type AgentBehaviorLinkTarget =
	| "settings-agents"
	| "settings-agent-backends"
	| "settings-connections"
	| "routine-detail"
	| "trigger-history";

export interface AgentBehaviorOriginView {
	readonly type: AgentBehaviorOriginType;
	readonly label: string;
	readonly state: AgentBehaviorOriginState;
}

export interface AgentBehaviorEditableField {
	readonly id: string;
	readonly label: string;
	readonly kind: AgentBehaviorFieldKind;
	readonly value: string | boolean | null;
	readonly options?: readonly { readonly value: string; readonly label: string }[];
	readonly placeholder?: string;
	readonly required?: boolean;
	readonly maxLength?: number;
	readonly helpText?: string;
}

export interface AgentBehaviorConfigLink {
	readonly target: AgentBehaviorLinkTarget;
	readonly label: string;
	readonly href: string;
}

export interface AgentBehaviorTriggerSummary {
	readonly occasionKind: string;
	readonly sourceId?: string;
	readonly selectedAgentLabel: string | null;
	readonly promptSource: AgentBehaviorPromptSource;
	readonly ownershipLabel: string;
}

export interface AgentBehaviorConfigView {
	readonly id: string;
	readonly kind: AgentBehaviorConfigKind;
	readonly name: string;
	readonly description?: string;
	readonly origin: AgentBehaviorOriginView;
	readonly valueSource: AgentBehaviorValueSource;
	readonly activeSummary: string;
	readonly defaultSummary?: string;
	readonly statusLabel: string;
	readonly active: boolean;
	readonly editableFields: readonly AgentBehaviorEditableField[];
	readonly links?: readonly AgentBehaviorConfigLink[];
	readonly trigger?: AgentBehaviorTriggerSummary;
}

export interface AgentBehaviorConfigListResponse {
	readonly items: readonly AgentBehaviorConfigView[];
}

export interface AgentBehaviorConfigPatchRequest {
	readonly fields: Record<string, string | boolean | null>;
}

export interface AgentBehaviorConfigPatchResponse {
	readonly item: AgentBehaviorConfigView;
}

export interface AgentBehaviorConfigErrorResponse {
	readonly error: string;
	readonly code:
		| "INVALID_KIND"
		| "NOT_FOUND"
		| "UNEDITABLE_FIELD"
		| "INVALID_VALUE"
		| "SECRET_VALUE_REJECTED"
		| "RATE_LIMITED";
}

export const AGENT_BEHAVIOR_CONFIG_KINDS = [
	"agent",
	"skill",
	"routine",
	"trigger",
	"tool",
	"mcp",
] as const satisfies readonly AgentBehaviorConfigKind[];

export function isAgentBehaviorConfigKind(value: string): value is AgentBehaviorConfigKind {
	return (AGENT_BEHAVIOR_CONFIG_KINDS as readonly string[]).includes(value);
}
