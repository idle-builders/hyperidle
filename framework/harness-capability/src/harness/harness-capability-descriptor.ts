import type { ModelProvider } from "@hyperidle/domain-model";

/**
 * The per-harness return-enforcement provisioning channel.
 * Declares HOW HyperIdle provisions return enforcement for this adapter.
 *
 * Channels:
 *   "sdk-inprocess"   — dead; no adapter declares this
 *   "settings-claude" — HyperIdle writes .claude/settings.json Stop hook (BLOCKING)
 *   "settings-codex"  — HyperIdle writes .codex/hooks.json Stop hook (BLOCKING)
 *   "process-reengage"— no native block — HyperIdle re-invokes the CLI in its sandbox (opencode, remote default)
 *   "soft-continue"   — native soft re-prompt (inert until spawnable)
 *   "none"            — no enforcement artifact — drain-gate floor only (last-resort remote)
 */
export type ReturnEnforcementChannel =
	| "sdk-inprocess"
	| "settings-claude"
	| "settings-codex"
	| "process-reengage"
	| "soft-continue"
	| "none";

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
	readonly defaultValue?: string | number | boolean;
}

export interface HarnessModelDescriptor {
	readonly id: string;
	readonly label: string;
	readonly provider?: ModelProvider;
	readonly contextWindow?: number;
	readonly selectable: boolean;
	readonly options: readonly HarnessModelOptionDescriptor[];
}

export interface HarnessDiscoveryStatus {
	readonly state: HarnessReadinessState;
	readonly version?: string;
	readonly reason?: string;
	/**
	 * Optional override — when true, this harness is treated as unavailable
	 * regardless of its discovery state. Undefined/absent == not disabled.
	 */
	readonly disabled?: boolean;
}

/**
 * Describes a harness — carries NO field describing what an agent may reach.
 * Inherited-reach facts live in `@hyperidle/domain-model` (`InheritedConnectionFact`).
 */
export interface HarnessCapabilityDescriptor {
	readonly type: string;
	readonly name: string;
	readonly kind: "local" | "remote";
	readonly authAction: HarnessAuthActionDescriptor;
	readonly discovery: HarnessDiscoveryStatus;
	readonly models: readonly HarnessModelDescriptor[];
	readonly returnEnforcement?: ReturnEnforcementChannel;
	readonly modelProviders: readonly string[];
}
