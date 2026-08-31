import type { ModelProvider } from "@hyperidle/domain-model";

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
	 * AM4 additive field — stamped by the route handler (not the pool, which is DB-free).
	 * true when the type is in server_config.harnessDisabled. No harness is exempt.
	 * Undefined/absent == not disabled (same as false). Breaking: no — additive field.
	 */
	readonly disabled?: boolean;
}

/**
 * AU36: the descriptor describes the harness — it carries NO field describing
 * what an agent may reach. The inherited-reach fact lives in
 * `@hyperidle/domain-model` (`InheritedConnectionFact`), probed and cached by
 * the connections domain. `InheritedToolDescriptor` and
 * `HarnessCapabilityDescriptor.inheritedTools` were deleted here with no
 * compatibility alias (plan constraint: no compat field, no dual-write).
 */
export interface HarnessCapabilityDescriptor {
	readonly type: string;
	readonly name: string;
	readonly kind: "local" | "remote";
	readonly authAction: HarnessAuthActionDescriptor;
	readonly discovery: HarnessDiscoveryStatus;
	readonly models: readonly HarnessModelDescriptor[];
	/**
	 * Whether this harness can run on an API key HyperIdle stores. Drives the
	 * "bring your own key" affordance in setup: a harness that accepts one is
	 * choosable before it has a login, because supplying the key IS the login.
	 */
	readonly acceptsApiKey: boolean;
	readonly returnEnforcement?: ReturnEnforcementChannel;
	/** Legacy compatibility for existing SettingsAgents selector. */
	readonly modelProviders: readonly string[];
}
