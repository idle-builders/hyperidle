import { z } from "zod";
import { PLUGIN_CONTRIBUTION_KINDS } from "../configuration.js";
import type { ActionDeclaration, Problem } from "./action.js";

// `"removed"` (third PluginState member) is neither list state: a removed plugin is a tombstone search_plugins never returns.

export const PLUGIN_LIST_STATES = ["enabled", "disabled"] as const;
export type PluginListState = (typeof PLUGIN_LIST_STATES)[number];

/**
 * What `search_plugins` may filter on: an installed row's state, or
 * `"available"` — a plugin that ships inside the app and that the viewer's
 * team (or, for a factory plugin, nobody) has not installed.
 */
const PLUGIN_SEARCH_STATES = [...PLUGIN_LIST_STATES, "available"] as const;

/**
 * Where a plugin's Install button puts it, read from the manifest's
 * `extensions["io.hyperidle"].installScope`: `team` — the viewer's team, one
 * install per team; `factory` — once, for everyone, its agents on no team.
 */
const PLUGIN_INSTALL_SCOPES = ["team", "factory"] as const;

export const PluginScopeSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("factory"), teamId: z.null() }),
	z.object({ kind: z.literal("team"), teamId: z.string().min(1) }),
]);
export type PluginScope = z.infer<typeof PluginScopeSchema>;

export const PluginContributionViewSchema = z.object({
	/** A contributed row, or `mcp_server` — a server read from the install's `mcp.json`. */
	kind: z.enum([...PLUGIN_CONTRIBUTION_KINDS, "mcp_server"]),
	/** The contributed row's id, or `<plugin name>/<server name>` for an MCP server. */
	entityId: z.string(),
	/** What a person calls it: an agent's name, a subscription's name, a document's title, a server's name. */
	label: z.string(),
	/** What `edit_plugin`'s restore names: the same as `entityId`. */
	key: z.string(),
	manifestKey: z.string(),
	/** A person has edited it, so a reinstall leaves their version alone. */
	detached: z.boolean(),
});
export type PluginContributionView = z.infer<typeof PluginContributionViewSchema>;

export const PluginViewSchema = z.object({
	id: z.string(),
	name: z.string(),
	version: z.string(),
	state: z.enum(PLUGIN_LIST_STATES),
	scope: PluginScopeSchema,
	installedAt: z.string(),
	updatedAt: z.string(),
	disabledAt: z.string().nullable(),
	contributions: z.array(PluginContributionViewSchema),
});
export type PluginView = z.infer<typeof PluginViewSchema>;

/** A bundled plugin not installed for this viewer; `id` is its manifest name, the name `edit_plugin`'s `bundled` source takes. */
const AvailablePluginViewSchema = z.object({
	id: z.string(),
	name: z.string(),
	version: z.string(),
	description: z.string().nullable(),
	state: z.literal("available"),
	installScope: z.enum(PLUGIN_INSTALL_SCOPES),
});
export type AvailablePluginView = z.infer<typeof AvailablePluginViewSchema>;

/** One row of `search_plugins`: an install, or a bundled plugin available to install. */
export type PluginListing = PluginView | AvailablePluginView;

// ---------------------------------------------------------------------------
// search_plugins
// ---------------------------------------------------------------------------

export const SearchPluginsInputSchema = z
	.object({
		ids: z.array(z.string()).optional(),
		state: z.enum(PLUGIN_SEARCH_STATES).optional(),
		text: z.string().min(1).optional(),
	})
	.strict();
export type SearchPluginsInput = z.infer<typeof SearchPluginsInputSchema>;

export const searchPlugins: ActionDeclaration<SearchPluginsInput, PluginListing[]> = {
	name: "search_plugins",
	sentence:
		"Search plugins: every install (enabled or disabled, whose scope, what it contributes) and " +
		"the plugins that ship with the app your team has not installed (state available — " +
		"install one with edit_plugin's bundled source). Filter by id, state, or text.",
	input: SearchPluginsInputSchema,
	output: z.array(z.union([PluginViewSchema, AvailablePluginViewSchema])),
};

// ---------------------------------------------------------------------------
// edit_plugin
// ---------------------------------------------------------------------------

/**
 * `plugin-fetch.ts`'s `PluginSource`, `scope` nested inside per source.
 * Deliberately no `ref` field on the `git` arm — the declared contract
 * names only `kind`/`url`/`scope`; a pinned-ref install is a separate,
 * later decision. `bundled` names a plugin that ships with the app by its
 * manifest name; the server finds the folder itself, never from a path.
 */
export const EditPluginSourceSchema = z.discriminatedUnion("kind", [
	z
		.object({ kind: z.literal("folder"), path: z.string().min(1), scope: PluginScopeSchema })
		.strict(),
	z.object({ kind: z.literal("git"), url: z.string().min(1), scope: PluginScopeSchema }).strict(),
	z.object({ kind: z.literal("zip"), path: z.string().min(1), scope: PluginScopeSchema }).strict(),
	z
		.object({ kind: z.literal("bundled"), name: z.string().min(1), scope: PluginScopeSchema })
		.strict(),
]);
export type EditPluginSource = z.infer<typeof EditPluginSourceSchema>;

export const EditPluginInputSchema = z
	.object({
		/** The install id, for every change but a source install, which derives its own. */
		id: z.string().min(1).optional(),
		source: EditPluginSourceSchema.optional(),
		state: z.enum(PLUGIN_LIST_STATES).optional(),
		remove: z.literal(true).optional(),
		/** `contribution` is the `key` `search_plugins` returns for a contributed row. */
		restore: z.object({ contribution: z.string().min(1) }).optional(),
	})
	.strict();
export type EditPluginInput = z.infer<typeof EditPluginInputSchema>;

export const editPlugin: ActionDeclaration<EditPluginInput, PluginView> = {
	name: "edit_plugin",
	sentence:
		"Install, enable, disable, remove or restore a plugin. Give exactly one of: source (install " +
		"from a folder, a repository URL, a zip, or a bundled plugin by name; scope for factory or " +
		"team lives inside it), state (enable or disable), remove, or restore (bring back a " +
		"person's edit of one detached contribution). Each team's install is its own; name it with " +
		"its id (the plugin name for a factory install, name@teamId for a team install) for every " +
		"change but a source install, which derives its own id.",
	input: EditPluginInputSchema,
	output: PluginViewSchema,
};

export const PLATFORM_ACTIONS = {
	search_plugins: searchPlugins,
	edit_plugin: editPlugin,
} as const;

// DB-dependent invariants (unknown_plugin, install_failed, unknown_team, etc.) run inside edit_plugin.run.

export function editPluginInvariants(input: EditPluginInput): Problem[] {
	const problems: Problem[] = [];

	const changeCount = [input.source, input.state, input.remove, input.restore].filter(
		(field) => field !== undefined,
	).length;
	if (changeCount !== 1) {
		problems.push({
			code: "one_change",
			message: "Give exactly one of source, state, remove or restore.",
			path: "source",
		});
	}

	if (input.source !== undefined && input.id !== undefined) {
		problems.push({
			code: "id_with_source",
			message: "A source install derives its own id from the manifest; do not name one.",
			path: "id",
		});
	}

	if (
		(input.state !== undefined || input.remove !== undefined || input.restore !== undefined) &&
		input.id === undefined
	) {
		problems.push({
			code: "plugin_id_required",
			message: "Name the plugin.",
			path: "id",
		});
	}

	return problems;
}
