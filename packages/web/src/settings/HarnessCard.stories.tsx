/**
 * HarnessCard stories — AM4 Variant C card states.
 * Production shape: runtime caps all-false (session probe not run yet, WARNING 4).
 */

import type { JSX } from "react";
import { HarnessCard } from "./HarnessCard.js";

export default { title: "Settings/HarnessCard", group: "Settings" };

const ALL_CAPS_FALSE = {
	preCompactionTrigger: false,
	subAgents: false,
	mcpSupport: false,
	modelProviders: ["anthropic"],
	fileEditing: false,
	toolUse: false,
};

const READY_DESCRIPTOR = {
	type: "claude-code",
	name: "Claude Code",
	kind: "local" as const,
	accessMode: "provider-subscription-cli" as const,
	authAction: {
		kind: "native_cli_login" as const,
		label: "Log in to Claude Code",
		command: ["claude", "auth", "login"],
	},
	discovery: { state: "ready" as const, version: "2.1.178" },
	models: [
		{
			id: "claude-sonnet-4-6",
			label: "Claude Sonnet 4.6",
			provider: "anthropic" as const,
			selectable: true,
			inheritedFromGateway: false,
			options: [],
		},
	],
	runtime: ALL_CAPS_FALSE,
	modelProviders: ["anthropic"],
};

/** Ready — enabled, all-false caps (production shape) */
export function Ready(): JSX.Element {
	return (
		<div className="max-w-[640px] border border-[var(--border-subtle)] rounded-[var(--r-default)] overflow-hidden bg-[var(--surface-elevated)]">
			<HarnessCard descriptor={READY_DESCRIPTOR} onToggle={() => {}} />
		</div>
	);
}

/** Ready — disabled row (toggle OFF) */
export function ReadyDisabled(): JSX.Element {
	const descriptor = {
		...READY_DESCRIPTOR,
		type: "codex",
		name: "Codex",
		authAction: {
			kind: "native_cli_login" as const,
			label: "Log in to Codex",
			command: ["codex", "login"],
		},
		discovery: {
			state: "ready" as const,
			version: "0.141.0",
			disabled: true,
			reason: "Turned off by user.",
		},
	};
	return (
		<div className="max-w-[640px] border border-[var(--border-subtle)] rounded-[var(--r-default)] overflow-hidden bg-[var(--surface-elevated)]">
			<HarnessCard descriptor={descriptor} onToggle={() => {}} />
		</div>
	);
}

/** Unauthenticated — shows auth zone with CTA + command */
export function Unauthenticated(): JSX.Element {
	const descriptor = {
		...READY_DESCRIPTOR,
		type: "codex",
		name: "Codex",
		authAction: {
			kind: "native_cli_login" as const,
			label: "Log in to Codex",
			command: ["codex", "login"],
		},
		discovery: { state: "unauthenticated" as const, version: "0.141.0" },
	};
	return (
		<div className="max-w-[640px] border border-[var(--border-subtle)] rounded-[var(--r-default)] overflow-hidden bg-[var(--surface-elevated)]">
			<HarnessCard descriptor={descriptor} onToggle={() => {}} />
		</div>
	);
}

/** Installed — auth status not yet confirmed */
export function Installed(): JSX.Element {
	const descriptor = {
		...READY_DESCRIPTOR,
		type: "opencode",
		name: "OpenCode",
		authAction: {
			kind: "native_cli_login" as const,
			label: "Log in to OpenCode",
			command: ["opencode", "providers", "login"],
		},
		discovery: { state: "installed" as const, version: "1.17.8" },
		models: [],
	};
	return (
		<div className="max-w-[640px] border border-[var(--border-subtle)] rounded-[var(--r-default)] overflow-hidden bg-[var(--surface-elevated)]">
			<HarnessCard descriptor={descriptor} onToggle={() => {}} />
		</div>
	);
}

/** Missing — install hint (no toggle) */
export function Missing(): JSX.Element {
	const descriptor = {
		...READY_DESCRIPTOR,
		type: "codex",
		name: "Codex",
		authAction: {
			kind: "native_cli_login" as const,
			label: "Log in to Codex",
			command: ["codex", "login"],
		},
		discovery: { state: "missing" as const, reason: "Not installed." },
		models: [],
	};
	return (
		<div className="max-w-[640px] border border-[var(--border-subtle)] rounded-[var(--r-default)] overflow-hidden bg-[var(--surface-elevated)]">
			<HarnessCard descriptor={descriptor} onToggle={() => {}} />
		</div>
	);
}

/** Unavailable — reason shown, no toggle, no action button */
export function Unavailable(): JSX.Element {
	const descriptor = {
		...READY_DESCRIPTOR,
		type: "cursor-agent",
		name: "Cursor Agent",
		authAction: { kind: "none" as const, label: "Configured in Cursor app" },
		discovery: {
			state: "unavailable" as const,
			reason: "No documented headless CLI surface.",
		},
		models: [],
	};
	return (
		<div className="max-w-[640px] border border-[var(--border-subtle)] rounded-[var(--r-default)] overflow-hidden bg-[var(--surface-elevated)]">
			<HarnessCard descriptor={descriptor} onToggle={() => {}} />
		</div>
	);
}

/** Builtin — no toggle (NOT disableable — founder rule) */
export function Builtin(): JSX.Element {
	const descriptor = {
		...READY_DESCRIPTOR,
		type: "builtin",
		name: "Built-in",
		accessMode: "api-gateway" as const,
		authAction: {
			kind: "enter_api_key" as const,
			label: "Enter API key",
			credentialNames: ["anthropic_api_key"],
		},
		discovery: { state: "ready" as const },
		runtime: { ...ALL_CAPS_FALSE, modelProviders: ["anthropic", "openrouter"] },
		modelProviders: ["anthropic", "openrouter"],
	};
	return (
		<div className="max-w-[640px] border border-[var(--border-subtle)] rounded-[var(--r-default)] overflow-hidden bg-[var(--surface-elevated)]">
			<HarnessCard descriptor={descriptor} onToggle={() => {}} />
		</div>
	);
}
