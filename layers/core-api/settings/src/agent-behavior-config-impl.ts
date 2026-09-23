/**
 * Agent-behavior configuration view-model — presentation projection of the
 * plugin-configuration resolution engine onto the settings-page display format.
 *
 * @lore AU20 R-settings: originally moved from @hyperidle/settings's barrel
 * to the route layer (layers/core-api/src/routes/) as a pure presentation
 * view-model with no cross-service consumer. Moved back once the user
 * module's `open_user`/`edit_user` (self-view `behaviour`) became a second
 * consumer — `@hyperidle/user` may not import the route layer to reach it,
 * so it belongs in the Service whose primitives it composes
 * (`listConfiguration`/`writeConfigurationOverride`), exported through the
 * barrel like every other typed function this Service exposes.
 */
import type { HyperIdleDb } from "@hyperidle/db";
import type { ConfigurationKind, ResolvedConfigurationItem } from "@hyperidle/domain-model";
import {
	type AgentBehaviorConfigKind,
	type AgentBehaviorConfigLink,
	type AgentBehaviorConfigView,
	type AgentBehaviorEditableField,
	type AgentBehaviorOriginView,
	type AgentBehaviorValueSource,
	isAgentBehaviorConfigKind,
} from "@hyperidle/domain-model";
import { listConfiguration, writeConfigurationOverride } from "./plugin-configuration.js";

export interface ListAgentBehaviorConfigOptions {
	readonly kind?: AgentBehaviorConfigKind;
}

export interface PatchAgentBehaviorConfigInput {
	readonly id: string;
	readonly fields: Record<string, string | boolean | null>;
	readonly createdByUserId?: string | null;
}

export class AgentBehaviorConfigError extends Error {
	constructor(
		readonly code:
			| "INVALID_KIND"
			| "NOT_FOUND"
			| "UNEDITABLE_FIELD"
			| "INVALID_VALUE"
			| "SECRET_VALUE_REJECTED",
		message: string,
	) {
		super(message);
		this.name = "AgentBehaviorConfigError";
	}
}

const CONFIG_KIND_TO_AGENT_BEHAVIOR_KIND: Partial<
	Record<ConfigurationKind, AgentBehaviorConfigKind>
> = {
	agent: "agent",
	skill: "skill",
	routine: "routine",
	tool: "tool",
	mcp_server: "mcp",
};

const AGENT_BEHAVIOR_KIND_TO_CONFIG_KIND: Record<AgentBehaviorConfigKind, ConfigurationKind> = {
	agent: "agent",
	skill: "skill",
	routine: "routine",
	tool: "tool",
	mcp: "mcp_server",
};

export async function listAgentBehaviorConfiguration(
	db: HyperIdleDb,
	options: ListAgentBehaviorConfigOptions = {},
): Promise<AgentBehaviorConfigView[]> {
	const configKind = options.kind ? AGENT_BEHAVIOR_KIND_TO_CONFIG_KIND[options.kind] : undefined;
	const resolved = await listConfiguration(db, { kind: configKind });
	return resolved
		.map(projectResolvedConfiguration)
		.filter((item): item is AgentBehaviorConfigView => {
			if (!item) return false;
			if (options.kind && item.kind !== options.kind) return false;
			return true;
		});
}

export async function patchAgentBehaviorConfiguration(
	db: HyperIdleDb,
	input: PatchAgentBehaviorConfigInput,
): Promise<AgentBehaviorConfigView> {
	const parsed = parseAgentBehaviorId(input.id);
	const entries = await listConfiguration(db, { kind: parsed.configKind, key: parsed.key });
	const existing = entries[0] ?? null;
	if (!existing) {
		throw new AgentBehaviorConfigError("NOT_FOUND", "Configuration item was not found.");
	}
	const currentValue = objectValue(existing.activeValue);
	const fields = editableFieldsFor(existing);
	const allowed = new Set(fields.map((field) => field.id));
	for (const fieldId of Object.keys(input.fields)) {
		if (!allowed.has(fieldId)) {
			throw new AgentBehaviorConfigError("UNEDITABLE_FIELD", `Field is not editable: ${fieldId}`);
		}
	}
	const nextValue = { ...currentValue, ...input.fields };
	try {
		const resolved = await writeConfigurationOverride(db, {
			kind: parsed.configKind,
			key: parsed.key,
			value: nextValue,
			createdByUserId: input.createdByUserId,
		});
		if (!resolved) {
			throw new AgentBehaviorConfigError(
				"NOT_FOUND",
				"Configuration item is not displayable after write.",
			);
		}
		const projected = projectResolvedConfiguration(resolved);
		if (!projected) {
			throw new AgentBehaviorConfigError("NOT_FOUND", "Configuration item is not displayable.");
		}
		return projected;
	} catch (err) {
		if (err instanceof AgentBehaviorConfigError) throw err;
		const message = err instanceof Error ? err.message : String(err);
		if (message.includes("secret-bearing")) {
			throw new AgentBehaviorConfigError("SECRET_VALUE_REJECTED", message);
		}
		throw new AgentBehaviorConfigError("INVALID_VALUE", message);
	}
}

function parseAgentBehaviorId(id: string): {
	kind: AgentBehaviorConfigKind;
	configKind: ConfigurationKind;
	key: string;
} {
	const separator = id.indexOf(":");
	if (separator < 1) throw new AgentBehaviorConfigError("NOT_FOUND", "Invalid configuration id.");
	const kind = id.slice(0, separator);
	const key = id.slice(separator + 1);
	if (!isAgentBehaviorConfigKind(kind)) {
		throw new AgentBehaviorConfigError("INVALID_KIND", `Unsupported configuration kind: ${kind}`);
	}
	if (!key) throw new AgentBehaviorConfigError("NOT_FOUND", "Invalid configuration id.");
	return { kind, configKind: AGENT_BEHAVIOR_KIND_TO_CONFIG_KIND[kind], key };
}

function projectResolvedConfiguration(
	item: ResolvedConfigurationItem,
): AgentBehaviorConfigView | null {
	const kind = CONFIG_KIND_TO_AGENT_BEHAVIOR_KIND[item.kind];
	if (!kind) return null;
	const value = objectValue(item.activeValue);
	const defaultValue = item.defaultValue === null ? null : objectValue(item.defaultValue);
	const origin = originView(item);
	const id = `${kind}:${item.key}`;
	const valueSource = item.valueSource as AgentBehaviorValueSource;
	return {
		id,
		kind,
		name: displayName(item.key, value),
		description: descriptionFor(kind, value),
		origin,
		valueSource,
		activeSummary: activeSummaryFor(kind, value),
		defaultSummary: defaultValue ? activeSummaryFor(kind, defaultValue) : undefined,
		statusLabel: statusLabelFor(item, valueSource),
		active: item.active,
		editableFields: editableFieldsFor(item),
		links: linksFor(kind, item.key),
	};
}

function objectValue(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function originView(item: ResolvedConfigurationItem): AgentBehaviorOriginView {
	if (item.origin.type === "user") {
		return { type: "user", label: "User-owned", state: "user_owned" };
	}
	if (item.origin.type === "builtin") {
		return { type: "builtin", label: "Built-in HyperIdle", state: "enabled" };
	}
	return {
		type: "plugin",
		label: `${item.origin.pluginName ?? item.origin.pluginId ?? "Unknown"} plugin`,
		state: item.origin.pluginState ?? "removed",
	};
}

function displayName(key: string, value: Record<string, unknown>): string {
	if (typeof value.name === "string" && value.name.trim()) return value.name;
	if (typeof value.service === "string" && value.service.trim()) return value.service;
	if (typeof value.id === "string" && value.id.trim()) return titleize(value.id);
	const raw = key.includes(".") ? key.slice(key.indexOf(".") + 1) : key;
	return titleize(raw);
}

function descriptionFor(
	kind: AgentBehaviorConfigKind,
	value: Record<string, unknown>,
): string | undefined {
	if (typeof value.description === "string") return value.description;
	if (kind === "mcp") return "MCP server configuration.";
	return undefined;
}

function activeSummaryFor(kind: AgentBehaviorConfigKind, value: Record<string, unknown>): string {
	switch (kind) {
		case "agent":
			return [value.name, value.role, value.harnessType].filter(isNonEmptyString).join(" · ");
		case "skill":
			return `autonomy level ${String(value.autonomyLevel ?? "default")}`;
		case "routine":
			return [value.triggerType, value.ownerAgentId].filter(isNonEmptyString).join(" · ");
		case "tool":
			return typeof value.description === "string"
				? value.description
				: String(value.name ?? "tool");
		case "mcp":
			return String(value.serverUrl ?? value.service ?? "MCP server");
	}
}

function statusLabelFor(
	item: ResolvedConfigurationItem,
	valueSource: AgentBehaviorValueSource,
): string {
	if (valueSource === "user_override") {
		if (item.origin.pluginState === "disabled") return "Override still runs";
		if (item.origin.pluginState === "removed") return "Override still runs";
		return "User override active";
	}
	if (item.origin.pluginState === "disabled") return "Inactive: plugin disabled";
	if (item.origin.pluginState === "removed") return "Needs attention: origin removed";
	if (item.origin.type === "builtin") return "Built-in";
	if (valueSource === "user_owned") return "User-owned";
	return "Default";
}

function editableFieldsFor(item: ResolvedConfigurationItem): AgentBehaviorEditableField[] {
	const value = objectValue(item.activeValue);
	switch (item.kind) {
		case "agent":
			return [{ id: "name", label: "Name", kind: "text", value: stringOrNull(value.name) }];
		case "tool":
			return [
				{ id: "enabled", label: "Enabled", kind: "toggle", value: Boolean(value.enabled ?? true) },
			];
		default:
			return [];
	}
}

function linksFor(kind: AgentBehaviorConfigKind, key: string): AgentBehaviorConfigLink[] {
	switch (kind) {
		case "agent":
			return [
				{ target: "settings-agents", label: "Open Agents", href: "#settings-section-agents" },
			];
		case "routine":
			return [
				{
					target: "routine-detail",
					label: "Open routine",
					href: `/work/routines/${encodeURIComponent(key)}`,
				},
			];
		case "mcp":
			return [
				{
					target: "settings-connections",
					label: "Open Connections",
					href: "#settings-section-connections",
				},
			];
		default:
			return [];
	}
}

function stringOrNull(value: unknown): string | null {
	return typeof value === "string" ? value : null;
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

function titleize(value: string): string {
	const normalised = value
		.replace(/^[^.]*\./, "")
		.replace(/[-_.]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	return normalised ? `${normalised[0]?.toUpperCase() ?? ""}${normalised.slice(1)}` : value;
}
