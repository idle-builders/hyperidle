import type { ConnectionHealth } from "../connection.js";
import type { ModelProvider } from "../model-gateway.js";
import type { HarnessCapabilities } from "./harness-adapter.js";

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
	/**
	 * AM4 additive field — stamped by the route handler (not the pool, which is DB-free).
	 * true when the type is in server_config.harnessDisabled. "builtin" is always exempt.
	 * Undefined/absent == not disabled (same as false). Breaking: no — additive field.
	 */
	readonly disabled?: boolean;
}

/**
 * AN1: Identity-only descriptor for a tool the harness/environment is already
 * configured with. Concept hard-rule 4: no secret, no token, no env, no command —
 * only name + kind + source + health.
 *
 * @lore AN1: Enforced at the type level — no secret field can appear here.
 * The descriptor type is the invariant, not a convention.
 */
export interface InheritedToolDescriptor {
	/** Server/CLI identity, e.g. "github", "linear", "gh". */
	readonly name: string;
	readonly kind: "mcp-server" | "cli";
	/** Source harness: "claude-code" | "codex" | "opencode" | "environment". */
	readonly harness: string;
	/** evidence-first; "unknown" when not provable from probe output. */
	readonly health: ConnectionHealth | "unknown";
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
	readonly returnEnforcement?: HarnessCapabilities["returnEnforcement"];
	/** Legacy compatibility for existing SettingsAgents selector. */
	readonly modelProviders: readonly string[];
	/**
	 * AN1: Tools the harness/environment is already configured with.
	 * Identity only — names and liveness, never token values.
	 * Default [] (additive, non-breaking for existing consumers).
	 *
	 * @lore AN1: Placed top-level (peer to runtime/models) because inherited
	 * tools are a harness-level fact, not a runtime capability boolean.
	 * Nesting under runtime would bloat HarnessRuntimeCapabilities consumers.
	 * connection.ts imports nothing from harness/ — no within-package cycle.
	 */
	readonly inheritedTools?: readonly InheritedToolDescriptor[];
}
