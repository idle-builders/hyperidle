import {
	type HarnessCapabilities,
	type HarnessCapabilityDescriptor,
	type HarnessModelDescriptor,
	MODEL_CATALOG,
} from "@hyperidle/shared";
import type { AdapterMeta } from "./adapter-pool.js";

export const KNOWN_HARNESS_FAMILIES = ["codex", "claude-code", "cursor-agent", "opencode"] as const;

type KnownHarnessFamily = (typeof KNOWN_HARNESS_FAMILIES)[number];

const KNOWN_HARNESS_NAMES: Record<KnownHarnessFamily, string> = {
	codex: "Codex",
	"claude-code": "Claude Code",
	"cursor-agent": "Cursor Agent",
	opencode: "OpenCode",
};

const KNOWN_HARNESS_LOGIN_COMMANDS: Record<KnownHarnessFamily, readonly string[]> = {
	codex: ["codex", "login"],
	"claude-code": ["claude", "login"],
	"cursor-agent": ["cursor-agent", "login"],
	opencode: ["opencode", "auth", "login"],
};

function isKnownHarnessFamily(type: string): type is KnownHarnessFamily {
	return (KNOWN_HARNESS_FAMILIES as readonly string[]).includes(type);
}

function runtimeFromCapabilities(caps: HarnessCapabilities) {
	return {
		preCompactionTrigger: caps.preCompactionTrigger,
		subAgents: caps.subAgents,
		mcpSupport: caps.mcpSupport,
		modelProviders: caps.modelProviders,
		fileEditing: caps.fileEditing ?? true,
		toolUse: caps.toolUse ?? true,
	};
}

function builtinModels(caps: HarnessCapabilities): readonly HarnessModelDescriptor[] {
	if (caps.descriptorModels) return caps.descriptorModels;
	return MODEL_CATALOG.map((model) => ({
		id: model.id,
		label: model.label,
		provider: model.provider,
		contextWindow: model.contextWindow,
		selectable: true,
		inheritedFromGateway: true,
		options: [],
	}));
}

function cliModels(caps: HarnessCapabilities): readonly HarnessModelDescriptor[] {
	return caps.descriptorModels ?? [];
}

export function describeRegisteredHarness(
	meta: AdapterMeta,
	caps: HarnessCapabilities,
): HarnessCapabilityDescriptor {
	const type = meta.type ?? meta.name;
	const runtime = runtimeFromCapabilities(caps);

	if (type === "builtin") {
		return {
			type,
			name: meta.name,
			kind: meta.kind,
			accessMode: caps.accessMode ?? "api-gateway",
			authAction: caps.authAction ?? {
				kind: "enter_api_key",
				label: "Enter API key",
				description: "Store a model gateway API key in HyperIdle.",
				credentialNames: ["anthropic_api_key", "openrouter_api_key", "openai_compatible_api_key"],
			},
			discovery: caps.discovery ?? { state: "ready" },
			models: builtinModels(caps),
			runtime,
			modelProviders: meta.modelProviders,
		};
	}

	if (isKnownHarnessFamily(type)) {
		return {
			type,
			name: meta.name,
			kind: meta.kind,
			accessMode: caps.accessMode ?? "provider-subscription-cli",
			authAction: caps.authAction ?? {
				kind: "native_cli_login",
				label: `Log in to ${KNOWN_HARNESS_NAMES[type]}`,
				command: KNOWN_HARNESS_LOGIN_COMMANDS[type],
			},
			discovery: caps.discovery ?? { state: "ready" },
			models: cliModels(caps),
			runtime,
			modelProviders: meta.modelProviders,
		};
	}

	return {
		type,
		name: meta.name,
		kind: meta.kind,
		accessMode: caps.accessMode ?? "external-byo",
		authAction: caps.authAction ?? { kind: "none", label: "Configured externally" },
		discovery: caps.discovery ?? { state: "ready" },
		models: cliModels(caps),
		runtime,
		modelProviders: meta.modelProviders,
	};
}

export function missingKnownHarnessDescriptors(
	registeredTypes: ReadonlySet<string>,
): HarnessCapabilityDescriptor[] {
	return KNOWN_HARNESS_FAMILIES.filter((type) => !registeredTypes.has(type)).map((type) => ({
		type,
		name: KNOWN_HARNESS_NAMES[type],
		kind: "local",
		accessMode: "provider-subscription-cli",
		authAction: {
			kind: "native_cli_login",
			label: `Log in to ${KNOWN_HARNESS_NAMES[type]}`,
			command: KNOWN_HARNESS_LOGIN_COMMANDS[type],
		},
		discovery: {
			state: "missing",
			reason: `${KNOWN_HARNESS_NAMES[type]} CLI is not installed or not on PATH.`,
		},
		models: [],
		runtime: {
			preCompactionTrigger: false,
			subAgents: false,
			mcpSupport: true,
			modelProviders: [],
			fileEditing: true,
			toolUse: true,
		},
		modelProviders: [],
	}));
}
