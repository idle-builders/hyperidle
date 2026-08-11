import { MODEL_CATALOG } from "@hyperidle/domain-model";
import type {
	HarnessCapabilityDescriptor,
	HarnessModelDescriptor,
	HarnessRuntimeCapabilities,
} from "@hyperidle/harness-capability";
import type { AdapterMeta, HarnessCapabilities } from "@hyperidle/harness-protocol";
import type { HarnessDiscoveryInput } from "./harness-discovery.js";

const KNOWN_HARNESS_FAMILIES = ["codex", "claude-code", "cursor-agent", "opencode"] as const;

type KnownHarnessFamily = (typeof KNOWN_HARNESS_FAMILIES)[number];

const KNOWN_HARNESS_NAMES: Record<KnownHarnessFamily, string> = {
	codex: "Codex",
	"claude-code": "Claude Code",
	"cursor-agent": "Cursor Agent",
	opencode: "OpenCode",
};

const KNOWN_HARNESS_LOGIN_COMMANDS: Record<KnownHarnessFamily, readonly string[]> = {
	codex: ["codex", "login"],
	"claude-code": ["claude", "auth", "login"],
	"cursor-agent": ["cursor-agent", "login"],
	opencode: ["opencode", "providers", "login"],
};

function isKnownHarnessFamily(type: string): type is KnownHarnessFamily {
	return (KNOWN_HARNESS_FAMILIES as readonly string[]).includes(type);
}

function runtimeFromCapabilities(caps: HarnessCapabilities): HarnessRuntimeCapabilities {
	return {
		preCompactionTrigger: caps.preCompactionTrigger,
		subAgents: caps.subAgents,
		mcpSupport: caps.mcpSupport,
		modelProviders: caps.modelProviders,
		fileEditing: caps.fileEditing ?? true,
		toolUse: caps.toolUse ?? true,
	};
}

function runtimeFromDiscovery(input?: HarnessDiscoveryInput): HarnessRuntimeCapabilities {
	// Missing/unavailable families start with zero proven capability.
	// fileEditing/toolUse are only set true when a real session probe confirms launchability
	// (sessionProbe?.ok === true AND the runtime field supplies the value).
	// auth status alone (state=ready, no sessionProbe) proves login, NOT launchability.
	if (!input?.runtime) {
		return {
			preCompactionTrigger: false,
			subAgents: false,
			mcpSupport: false,
			modelProviders: [],
			fileEditing: false,
			toolUse: false,
		};
	}

	// Gate fileEditing/toolUse on sessionProbe.ok — auth-status-only probes stay false.
	const sessionProbeOk = input.sessionProbe?.ok === true;

	return {
		preCompactionTrigger: input.runtime.preCompactionTrigger ?? false,
		subAgents: input.runtime.subAgents ?? false,
		mcpSupport: input.runtime.mcpSupport ?? false,
		modelProviders: input.runtime.modelProviders ?? [],
		// Only true when the runtime declares true AND the session probe confirmed launchability
		fileEditing: sessionProbeOk ? (input.runtime.fileEditing ?? false) : false,
		toolUse: sessionProbeOk ? (input.runtime.toolUse ?? false) : false,
	};
}

function builtinModels(caps: HarnessCapabilities): readonly HarnessModelDescriptor[] {
	if (caps.descriptorModels) return caps.descriptorModels;
	// @lore AU19 Increment 4: explicit element type — `(typeof MODEL_CATALOG)[number]`
	// infers `any` for the map callback under this package's standalone
	// `tsc --noEmit -p <pkg>/tsconfig.json` (same pre-existing cross-package-reference
	// artifact documented in `llm-client.ts`'s `isHttpError` — reproduces identically
	// in otherwise-clean leaf packages, not introduced by this migration).
	return MODEL_CATALOG.map((model: (typeof MODEL_CATALOG)[number]) => ({
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

function cliModelsFromInput(
	models?: readonly HarnessModelDescriptor[],
): readonly HarnessModelDescriptor[] {
	return models ?? [];
}

function mergeDiscovery(
	base: HarnessCapabilityDescriptor["discovery"],
	override?: HarnessDiscoveryInput,
): HarnessCapabilityDescriptor["discovery"] {
	if (!override) return base;
	return {
		state: override.state,
		version: override.version,
		reason: override.reason,
	};
}

function authActionOrDefault(
	type: KnownHarnessFamily,
	authAction?: HarnessCapabilityDescriptor["authAction"],
): HarnessCapabilityDescriptor["authAction"] {
	if (authAction) return authAction;
	return {
		kind: "native_cli_login",
		label: `Log in to ${KNOWN_HARNESS_NAMES[type]}`,
		command: KNOWN_HARNESS_LOGIN_COMMANDS[type],
	};
}

function describe(
	meta: AdapterMeta,
	caps: HarnessCapabilities,
	discoveries?: Readonly<Record<string, HarnessDiscoveryInput | undefined>>,
): HarnessCapabilityDescriptor {
	const type = meta.type ?? meta.name;
	const runtime = runtimeFromCapabilities(caps);

	if (type === "builtin") {
		// @lore AV2 Build Obligation 5: builtin branch reads discoveries[builtin].models
		// when present (populated by probeBuiltinGateway's /models fetch), NOT caps.descriptorModels.
		// caps.descriptorModels is the legacy fallback for the static pre-AV2 path; once
		// the async fetch populates discoveries.builtin.models, that wins.
		const discoveredModels = discoveries?.[type]?.models;
		const models: readonly HarnessModelDescriptor[] =
			discoveredModels && discoveredModels.length > 0 ? discoveredModels : builtinModels(caps);

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
			discovery: mergeDiscovery(caps.discovery ?? { state: "ready" }, discoveries?.[type]),
			models,
			runtime,
			returnEnforcement: caps.returnEnforcement,
			modelProviders: meta.modelProviders,
		};
	}

	if (isKnownHarnessFamily(type)) {
		// @lore AV2: known CLI harnesses prefer discoveries[type].models (populated by
		// probeClaudeCodeCli / probeOpenCodeCli at probe time), falling back to
		// caps.descriptorModels (the legacy static path). This is the "discovered wins" rule.
		const discoveredModels = discoveries?.[type]?.models;
		const models: readonly HarnessModelDescriptor[] =
			discoveredModels && discoveredModels.length > 0 ? discoveredModels : cliModels(caps);

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
			discovery: mergeDiscovery(caps.discovery ?? { state: "ready" }, discoveries?.[type]),
			models,
			runtime,
			returnEnforcement: caps.returnEnforcement,
			modelProviders: meta.modelProviders,
		};
	}

	// External harnesses: same discovered-wins rule
	const discoveredModels = discoveries?.[type]?.models;
	const models: readonly HarnessModelDescriptor[] =
		discoveredModels && discoveredModels.length > 0 ? discoveredModels : cliModels(caps);

	return {
		type,
		name: meta.name,
		kind: meta.kind,
		accessMode: caps.accessMode ?? "external-byo",
		authAction: caps.authAction ?? { kind: "none", label: "Configured externally" },
		discovery: mergeDiscovery(caps.discovery ?? { state: "ready" }, discoveries?.[type]),
		models,
		runtime,
		returnEnforcement: caps.returnEnforcement,
		modelProviders: meta.modelProviders,
	};
}

function missing(
	registeredTypes: ReadonlySet<string>,
	discoveries?: Readonly<Record<string, HarnessDiscoveryInput | undefined>>,
): HarnessCapabilityDescriptor[] {
	return KNOWN_HARNESS_FAMILIES.filter((type) => !registeredTypes.has(type)).map((type) => {
		const discoveryInput = discoveries?.[type];
		const discovery = mergeDiscovery(
			{
				state: "missing",
				reason: `${KNOWN_HARNESS_NAMES[type]} CLI is not installed or not on PATH.`,
			},
			discoveryInput,
		);

		return {
			type,
			name: KNOWN_HARNESS_NAMES[type],
			kind: "local",
			accessMode: "provider-subscription-cli",
			authAction: authActionOrDefault(type, discoveryInput?.authAction),
			discovery,
			models: cliModelsFromInput(discoveryInput?.models),
			runtime: runtimeFromDiscovery(discoveryInput),
			returnEnforcement: "none",
			modelProviders: [],
		};
	});
}

export function createCapabilityCatalog() {
	return { describe, missing };
}
