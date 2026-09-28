import type {
	HarnessCapabilityDescriptor,
	HarnessModelDescriptor,
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

	if (isKnownHarnessFamily(type)) {
		// @lore: known harness descriptor — discoveries[type].models wins over caps.descriptorModels; probed models always override static fallback
		const discoveredModels = discoveries?.[type]?.models;
		const models: readonly HarnessModelDescriptor[] =
			discoveredModels && discoveredModels.length > 0 ? discoveredModels : cliModels(caps);

		return {
			type,
			name: meta.name,
			kind: meta.kind,
			authAction: caps.authAction ?? {
				kind: "native_cli_login",
				label: `Log in to ${KNOWN_HARNESS_NAMES[type]}`,
				command: KNOWN_HARNESS_LOGIN_COMMANDS[type],
			},
			discovery: mergeDiscovery(caps.discovery ?? { state: "ready" }, discoveries?.[type]),
			models,
			returnEnforcement: caps.returnEnforcement,
			modelProviders: meta.modelProviders,
		};
	}

	const discoveredModels = discoveries?.[type]?.models;
	const models: readonly HarnessModelDescriptor[] =
		discoveredModels && discoveredModels.length > 0 ? discoveredModels : cliModels(caps);

	return {
		type,
		name: meta.name,
		kind: meta.kind,
		authAction: caps.authAction ?? { kind: "none", label: "Configured externally" },
		discovery: mergeDiscovery(caps.discovery ?? { state: "ready" }, discoveries?.[type]),
		models,
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
			authAction: authActionOrDefault(type, discoveryInput?.authAction),
			discovery,
			models: cliModelsFromInput(discoveryInput?.models),
			returnEnforcement: "none",
			modelProviders: [],
		};
	});
}

export { describe as describeHarnessCapability, missing as missingHarnessCapabilities };
