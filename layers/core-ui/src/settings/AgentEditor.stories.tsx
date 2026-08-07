/**
 * AV2 — AgentEditor stories.
 *
 * The story IS the design artifact (AJ1: TSX-first design). These stories render
 * key states of the AgentEditor in the `/designsystem` viewer.
 *
 * States covered:
 *  - NormalAgent: editing a regular team agent (builtin harness, discovered models)
 *  - AssistantAgent: editing the assistant (ast-* id, role disabled)
 *  - EmptyModels: codex harness — no discovered models → affordance text
 *  - SavingState: save in progress
 *  - WithError: inline 422 error shown
 *
 * @lore AV2: AgentEditor is a pure controlled component — no network calls, no side
 * effects (unless fetchTemplateOnMount=true). Stories provide all props inline.
 */

import { type JSX, useState } from "react";
import type { AgentEditorDraft } from "./AgentEditor.js";
import { AgentEditor } from "./AgentEditor.js";

export default { title: "AgentEditor", group: "Settings" };

// ---------------------------------------------------------------------------
// Fixture descriptors (no MODEL_CATALOG — AV2 discovered models only)
// ---------------------------------------------------------------------------

const BUILTIN_DESCRIPTOR = {
	type: "builtin",
	name: "Built-in",
	kind: "local" as const,
	models: [
		{
			id: "openrouter/deepseek/deepseek-v4-flash",
			label: "DeepSeek V4 Flash",
			provider: "openrouter" as const,
			contextWindow: 128000,
			selectable: true,
			inheritedFromGateway: true,
			options: [],
		},
		{
			id: "anthropic/claude-haiku-4-5",
			label: "Claude Haiku 4.5",
			provider: "anthropic" as const,
			contextWindow: 200000,
			selectable: true,
			inheritedFromGateway: true,
			options: [],
		},
	],
	modelProviders: ["anthropic", "openrouter", "openai-compatible"],
	accessMode: "api-gateway" as const,
	discovery: { state: "ready" as const },
	authAction: { kind: "enter_api_key" as const, label: "Enter API key" },
	inheritedTools: [],
	runtime: {
		preCompactionTrigger: false,
		subAgents: false,
		mcpSupport: false,
		modelProviders: [],
		fileEditing: true,
		toolUse: true,
	},
};

const CODEX_DESCRIPTOR = {
	type: "codex",
	name: "Codex",
	kind: "local" as const,
	models: [],
	modelProviders: [],
	accessMode: "provider-subscription-cli" as const,
	discovery: { state: "ready" as const },
	authAction: {
		kind: "native_cli_login" as const,
		label: "Log in to Codex",
		command: ["codex", "login"],
	},
	inheritedTools: [],
	runtime: {
		preCompactionTrigger: false,
		subAgents: false,
		mcpSupport: false,
		modelProviders: [],
		fileEditing: false,
		toolUse: false,
	},
};

const CLAUDE_CODE_DESCRIPTOR = {
	type: "claude-code",
	name: "Claude Code",
	kind: "local" as const,
	models: [
		{
			id: "claude-sonnet-4-6",
			label: "Claude Sonnet 4.6",
			provider: "anthropic" as const,
			contextWindow: 1000000,
			selectable: true,
			inheritedFromGateway: false,
			options: [],
		},
		{
			id: "claude-haiku-4-5",
			label: "Claude Haiku 4.5",
			provider: "anthropic" as const,
			contextWindow: 200000,
			selectable: true,
			inheritedFromGateway: false,
			options: [],
		},
	],
	modelProviders: ["anthropic"],
	accessMode: "provider-subscription-cli" as const,
	discovery: { state: "ready" as const },
	authAction: {
		kind: "native_cli_login" as const,
		label: "Log in to Claude Code",
		command: ["claude", "auth", "login"],
	},
	inheritedTools: [],
	runtime: {
		preCompactionTrigger: false,
		subAgents: false,
		mcpSupport: false,
		modelProviders: [],
		fileEditing: true,
		toolUse: true,
	},
};

const ALL_HARNESSES = [BUILTIN_DESCRIPTOR, CODEX_DESCRIPTOR, CLAUDE_CODE_DESCRIPTOR];

// ---------------------------------------------------------------------------
// NormalAgent: regular team agent with builtin harness + discovered models
// ---------------------------------------------------------------------------

function NormalAgentEditor(): JSX.Element {
	const [draft, setDraft] = useState<AgentEditorDraft>({
		name: "Atlas",
		role: "builder",
		systemPrompt: "You are Atlas, a builder agent. You implement features from plans.",
		harnessType: "builtin",
		modelId: "openrouter/deepseek/deepseek-v4-flash",
		modelProvider: "openrouter",
		maxConcurrentSessions: 1,
		filesystemIds: [],
	});

	return (
		<AgentEditor
			agentId="agent-atlas"
			draft={draft}
			onDraftChange={(fn) => setDraft((prev) => fn(prev))}
			harnesses={ALL_HARNESSES}
			onSave={() => undefined}
			onCancel={() => undefined}
			saving={false}
			error={null}
		/>
	);
}

export const NormalAgent = (): JSX.Element => <NormalAgentEditor />;

// ---------------------------------------------------------------------------
// AssistantAgent: ast-* id, role disabled, assistant route hint
// ---------------------------------------------------------------------------

function AssistantAgentEditor(): JSX.Element {
	const [draft, setDraft] = useState<AgentEditorDraft>({
		name: "Nova",
		role: "assistant",
		systemPrompt:
			"You are Nova, your personal assistant. You help coordinate work and answer questions.",
		harnessType: "builtin",
		modelId: "anthropic/claude-haiku-4-5",
		modelProvider: "anthropic",
		maxConcurrentSessions: 1,
		filesystemIds: [],
	});

	return (
		<AgentEditor
			agentId="ast-user1"
			draft={draft}
			onDraftChange={(fn) => setDraft((prev) => fn(prev))}
			harnesses={ALL_HARNESSES}
			onSave={() => undefined}
			onCancel={() => undefined}
			saving={false}
			error={null}
		/>
	);
}

export const AssistantAgent = (): JSX.Element => <AssistantAgentEditor />;

// ---------------------------------------------------------------------------
// EmptyModels: codex harness — no discovered models → affordance text
// ---------------------------------------------------------------------------

function EmptyModelsEditor(): JSX.Element {
	const [draft, setDraft] = useState<AgentEditorDraft>({
		name: "Kira",
		role: "reviewer",
		systemPrompt: "You are Kira, a code reviewer.",
		harnessType: "codex",
		modelId: "",
		modelProvider: null,
		maxConcurrentSessions: 1,
		filesystemIds: [],
	});

	return (
		<AgentEditor
			agentId="agent-kira"
			draft={draft}
			onDraftChange={(fn) => setDraft((prev) => fn(prev))}
			harnesses={ALL_HARNESSES}
			onSave={() => undefined}
			onCancel={() => undefined}
			saving={false}
			error={null}
		/>
	);
}

export const EmptyModels = (): JSX.Element => <EmptyModelsEditor />;

// ---------------------------------------------------------------------------
// SavingState: save in progress
// ---------------------------------------------------------------------------

export const SavingState = (): JSX.Element => (
	<AgentEditor
		agentId="agent-atlas"
		draft={{
			name: "Atlas",
			role: "builder",
			systemPrompt: "You are Atlas.",
			harnessType: "builtin",
			modelId: "openrouter/deepseek/deepseek-v4-flash",
			modelProvider: "openrouter",
			maxConcurrentSessions: 1,
			filesystemIds: [],
		}}
		onDraftChange={() => undefined}
		harnesses={ALL_HARNESSES}
		onSave={() => undefined}
		onCancel={() => undefined}
		saving={true}
		error={null}
	/>
);

// ---------------------------------------------------------------------------
// WithError: inline 422 error shown
// ---------------------------------------------------------------------------

export const WithError = (): JSX.Element => (
	<AgentEditor
		agentId="agent-atlas"
		draft={{
			name: "Atlas",
			role: "builder",
			systemPrompt: "You are Atlas.",
			harnessType: "claude-code",
			modelId: "openrouter/deepseek/deepseek-v4-flash",
			modelProvider: "openrouter",
			maxConcurrentSessions: 1,
			filesystemIds: [],
		}}
		onDraftChange={() => undefined}
		harnesses={ALL_HARNESSES}
		onSave={() => undefined}
		onCancel={() => undefined}
		saving={false}
		error="Model provider 'openrouter' is not supported by this harness. Allowed: anthropic."
	/>
);
