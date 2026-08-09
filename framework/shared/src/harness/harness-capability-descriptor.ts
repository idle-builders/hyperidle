import type { ConnectionHealth } from "../connection.js";
import type { ModelProvider } from "../model-gateway.js";

/**
 * @lore AU34: this type is declared HERE, beside the descriptor, and imported back by the adapter —
 * the reverse of where it used to sit. The descriptor's `returnEnforcement` field was the single edge
 * that made the harness protocol and the harness capability import each other, and the split puts
 * them in different packages. Moving the closed set to the side a screen legitimately reads, and
 * naming it directly instead of indexing `HarnessCapabilities`, is what makes the graph acyclic.
 *
 * The per-harness return-enforcement provisioning channel.
 * Declares HOW HyperIdle provisions return enforcement for this adapter.
 * Non-optional — TypeScript strict forces every adapter to declare a channel,
 * making "uniform across harnesses" un-skippable.
 *
 * Channels:
 *   "sdk-inprocess"   — dead since claude moved to settings-claude; no adapter declares this
 *   "settings-claude" — HyperIdle writes .claude/settings.json Stop hook (BLOCKING)
 *   "settings-codex"  — HyperIdle writes .codex/hooks.json Stop hook (BLOCKING)
 *   "builtin-loop"    — in-process loop owns turn-end (BLOCKING)
 *   "process-reengage"— no native block — HyperIdle re-invokes the CLI in its sandbox (opencode, remote default)
 *   "soft-continue"   — native soft re-prompt (cursor — inert until spawnable)
 *   "none"            — no enforcement artifact — drain-gate floor only (last-resort remote)
 *
 * @lore The non-optional field is the forcing function: npm run check fails any adapter
 * that doesn't declare a channel. The drain-end ReturnGate is the un-bypassable backstop
 * on ALL.
 */
export type ReturnEnforcementChannel =
	| "sdk-inprocess"
	| "settings-claude"
	| "settings-codex"
	| "builtin-loop"
	| "process-reengage"
	| "soft-continue"
	| "none";

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
	readonly returnEnforcement?: ReturnEnforcementChannel;
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
