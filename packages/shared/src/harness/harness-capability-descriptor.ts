import type { ModelProvider } from "../model-gateway.js";

export const HARNESS_OPTION_CONTROL_KINDS = ["select", "boolean", "number", "text"] as const;
export type HarnessOptionControlKind = (typeof HARNESS_OPTION_CONTROL_KINDS)[number];

export type HarnessAccessMode = "api-gateway" | "provider-subscription-cli" | "external-byo";

export type HarnessReadinessState =
	| "missing"
	| "installed"
	| "unauthenticated"
	| "ready"
	| "unavailable";

export type HarnessAuthActionKind = "enter_api_key" | "native_cli_login" | "none";

export interface HarnessAuthActionDescriptor {
	readonly kind: HarnessAuthActionKind;
	readonly label: string;
	readonly description?: string;
	readonly command?: readonly string[];
	readonly credentialNames?: readonly string[];
}

export interface HarnessOptionChoice {
	readonly value: string;
	readonly label: string;
}

export type HarnessModelOptionControl =
	| { readonly kind: "select"; readonly choices: readonly HarnessOptionChoice[] }
	| { readonly kind: "boolean" }
	| {
			readonly kind: "number";
			readonly min?: number;
			readonly max?: number;
			readonly step?: number;
	  }
	| { readonly kind: "text"; readonly placeholder?: string };

export interface HarnessModelOptionDescriptor {
	readonly key: string;
	readonly label: string;
	readonly helpText?: string;
	readonly control: HarnessModelOptionControl;
	readonly required: boolean;
	readonly scope: "launch" | "durable";
	readonly defaultValue?: string | number | boolean;
}

export interface HarnessModelDescriptor {
	readonly id: string;
	readonly label: string;
	readonly provider?: ModelProvider;
	readonly contextWindow?: number;
	readonly selectable: boolean;
	readonly inheritedFromGateway: boolean;
	readonly options: readonly HarnessModelOptionDescriptor[];
}

export interface HarnessRuntimeCapabilities {
	readonly preCompactionTrigger: boolean;
	readonly subAgents: boolean;
	readonly mcpSupport: boolean;
	readonly modelProviders: readonly string[];
	readonly fileEditing: boolean;
	readonly toolUse: boolean;
}

export interface HarnessDiscoveryStatus {
	readonly state: HarnessReadinessState;
	readonly version?: string;
	readonly reason?: string;
}

export interface HarnessCapabilityDescriptor {
	readonly type: string;
	readonly name: string;
	readonly kind: "local" | "remote";
	readonly accessMode: HarnessAccessMode;
	readonly authAction: HarnessAuthActionDescriptor;
	readonly discovery: HarnessDiscoveryStatus;
	readonly models: readonly HarnessModelDescriptor[];
	readonly runtime: HarnessRuntimeCapabilities;
	/** Legacy compatibility for existing SettingsAgents selector. */
	readonly modelProviders: readonly string[];
}
