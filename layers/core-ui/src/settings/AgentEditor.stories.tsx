/**
 * AV2 — AgentEditor stories.
 *
 * The story IS the design artifact (AJ1: TSX-first design). These stories render
 * key states of the AgentEditor in the `/designsystem` viewer.
 *
 * States covered:
 *  - NormalAgent: editing a regular team agent (opencode harness, discovered models)
 *  - AssistantAgent: editing the assistant (ownerUserId set, role disabled)
 *  - EmptyModels: codex harness — no discovered models → affordance text
 *  - SavingState: save in progress
 *  - WithError: inline 422 error shown
 *
 * @lore AgentEditor is pure controlled component — no network calls; stories provide all props inline
 */

import { type JSX, useState } from "react";
import type { AgentEditorDraft } from "./AgentEditor.js";
import { AgentEditor } from "./AgentEditor.js";

export default { title: "AgentEditor", group: "Settings" };

// ---------------------------------------------------------------------------
// Fixture descriptors (no MODEL_CATALOG — AV2 discovered models only)
// ---------------------------------------------------------------------------

// The key-accepting harness: opencode runs on a key HyperIdle stores, under the
// variable its provider reads. Its models come from `opencode models`, so they
// are its own — not inherited from a gateway.
const OPENCODE_DESCRIPTOR = {
	type: "opencode",
	name: "OpenCode",
	kind: "local" as const,
	models: [
		{
			id: "openrouter/deepseek/deepseek-v4-flash",
			label: "DeepSeek V4 Flash",
			provider: "openrouter" as const,
			contextWindow: 128000,
			selectable: true,
			options: [],
		},
		{
			id: "openrouter/z-ai/glm-4.7-flash",
			label: "GLM 4.7 Flash",
			provider: "openrouter" as const,
			contextWindow: 200000,
			selectable: true,
			options: [],
		},
	],
	modelProviders: ["anthropic", "openrouter", "openai-compatible"],
	accessMode: "provider-subscription-cli" as const,
	discovery: { state: "ready" as const },
	authAction: {
		kind: "native_cli_login" as const,
		label: "Log in to OpenCode",
		command: ["opencode", "providers", "login"],
	},
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
			// What `claude --help` actually declares — see harness-discovery.
			options: [
				{
					key: "effort",
					label: "Effort",
					helpText: "How much the model works before answering.",
					control: {
						kind: "select" as const,
						choices: [
							{ value: "low", label: "low" },
							{ value: "medium", label: "medium" },
							{ value: "high", label: "high" },
							{ value: "xhigh", label: "xhigh" },
							{ value: "max", label: "max" },
						],
					},
					required: false,
				},
			],
		},
		{
			id: "claude-haiku-4-5",
			label: "Claude Haiku 4.5",
			provider: "anthropic" as const,
			contextWindow: 200000,
			selectable: true,
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
	runtime: {
		preCompactionTrigger: false,
		subAgents: false,
		mcpSupport: false,
		modelProviders: [],
		fileEditing: true,
		toolUse: true,
	},
};

const ALL_HARNESSES = [OPENCODE_DESCRIPTOR, CODEX_DESCRIPTOR, CLAUDE_CODE_DESCRIPTOR];

// ---------------------------------------------------------------------------
// NormalAgent: regular team agent with an opencode harness + discovered models
// ---------------------------------------------------------------------------

function NormalAgentEditor(): JSX.Element {
	const [draft, setDraft] = useState<AgentEditorDraft>({
		name: "Atlas",
		role: "builder",
		systemPrompt: "You are Atlas, a builder agent. You implement features from plans.",
		harnessType: "opencode",
		modelId: "openrouter/deepseek/deepseek-v4-flash",
		modelProvider: "openrouter",
		maxConcurrentSessions: 1,
		filesystemIds: [],
		modelOptions: {},
	});

	return (
		<AgentEditor
			agentId="agent-atlas"
			ownerUserId={null}
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
// AssistantAgent: ownerUserId set, role disabled
// ---------------------------------------------------------------------------

function AssistantAgentEditor(): JSX.Element {
	const [draft, setDraft] = useState<AgentEditorDraft>({
		name: "Nova",
		role: "assistant",
		systemPrompt:
			"You are Nova, your personal assistant. You help coordinate work and answer questions.",
		harnessType: "opencode",
		modelId: "anthropic/claude-haiku-4-5",
		modelProvider: "anthropic",
		maxConcurrentSessions: 1,
		filesystemIds: [],
		modelOptions: {},
	});

	return (
		<AgentEditor
			agentId="agent-nova"
			ownerUserId="user1"
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
		modelOptions: {},
	});

	return (
		<AgentEditor
			agentId="agent-kira"
			ownerUserId={null}
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
		ownerUserId={null}
		draft={{
			name: "Atlas",
			role: "builder",
			systemPrompt: "You are Atlas.",
			harnessType: "opencode",
			modelId: "openrouter/deepseek/deepseek-v4-flash",
			modelProvider: "openrouter",
			maxConcurrentSessions: 1,
			filesystemIds: [],
			modelOptions: {},
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
		ownerUserId={null}
		draft={{
			name: "Atlas",
			role: "builder",
			systemPrompt: "You are Atlas.",
			harnessType: "claude-code",
			modelId: "openrouter/deepseek/deepseek-v4-flash",
			modelProvider: "openrouter",
			maxConcurrentSessions: 1,
			filesystemIds: [],
			modelOptions: {},
		}}
		onDraftChange={() => undefined}
		harnesses={ALL_HARNESSES}
		onSave={() => undefined}
		onCancel={() => undefined}
		saving={false}
		error="Model provider 'openrouter' is not supported by this harness. Allowed: anthropic."
	/>
);

// ---------------------------------------------------------------------------
// WithModelOptions: the selected model declares options, set once for the agent
// ---------------------------------------------------------------------------

export const WithModelOptions = (): JSX.Element => (
	<AgentEditor
		agentId="agent-atlas"
		ownerUserId={null}
		draft={{
			name: "Atlas",
			role: "builder",
			systemPrompt: "You are Atlas.",
			harnessType: "claude-code",
			modelId: "claude-sonnet-4-6",
			modelProvider: "anthropic",
			maxConcurrentSessions: 1,
			filesystemIds: [],
			modelOptions: { effort: "high" },
		}}
		onDraftChange={() => undefined}
		harnesses={ALL_HARNESSES}
		onSave={() => undefined}
		onCancel={() => undefined}
		saving={false}
		error={null}
	/>
);

// ---------------------------------------------------------------------------
// NoModelOptions: the selected model declares none — the section is absent
// ---------------------------------------------------------------------------

export const NoModelOptions = (): JSX.Element => (
	<AgentEditor
		agentId="agent-atlas"
		ownerUserId={null}
		draft={{
			name: "Atlas",
			role: "builder",
			systemPrompt: "You are Atlas.",
			harnessType: "claude-code",
			modelId: "claude-haiku-4-5",
			modelProvider: "anthropic",
			maxConcurrentSessions: 1,
			filesystemIds: [],
			modelOptions: {},
		}}
		onDraftChange={() => undefined}
		harnesses={ALL_HARNESSES}
		onSave={() => undefined}
		onCancel={() => undefined}
		saving={false}
		error={null}
	/>
);
