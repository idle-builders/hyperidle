import { z } from "zod";
import {
	BUILTIN_PLUGIN_ID,
	CONFIGURATION_KINDS,
	PLUGIN_CONTRIBUTION_KINDS,
} from "../configuration.js";
import type { ActionDeclaration, Problem } from "./action.js";

/**
 * @lore The platform action list — search, edit. This is what replaces
 * `routes/plugins.ts` (984 lines: six routes, `PluginView`/
 * `PluginContributionView`, the install/enable/disable/remove/restore
 * lifecycle). `PluginView`/`PluginContributionView` move here from
 * `routes/plugins.ts:106-132` unchanged in shape.
 *
 * `edit_plugin` is one partial input discriminated by which change field is
 * present (an edit shape, not a verb field), with the install `scope`
 * nested inside `source` so "scope without source" is unrepresentable
 * rather than an invariant this file has to check.
 */

// ---------------------------------------------------------------------------
// Vocabulary this module needs beyond `../configuration.js`'s own exports.
// `PLUGIN_LIST_STATES` is the two states a person or agent may ask to filter
// on or set — `"removed"` (the third `PluginState` member) is neither: a
// removed plugin is a tombstone `search_plugins` never returns.
// ---------------------------------------------------------------------------

export const PLUGIN_LIST_STATES = ["enabled", "disabled"] as const;
export type PluginListState = (typeof PLUGIN_LIST_STATES)[number];

/** `plugins.ts:63`'s `PluginScope` (`PluginScopeKind` + `teamId`), as a zod shape. */
export const PluginScopeSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("factory"), teamId: z.null() }),
	z.object({ kind: z.literal("team"), teamId: z.string().min(1) }),
]);
export type PluginScope = z.infer<typeof PluginScopeSchema>;

// ---------------------------------------------------------------------------
// The row — `PluginView`/`PluginContributionView` moved out of
// `routes/plugins.ts:106-132`, unchanged in shape.
// ---------------------------------------------------------------------------

export const PluginContributionViewSchema = z.object({
	kind: z.union([z.enum(CONFIGURATION_KINDS), z.enum(PLUGIN_CONTRIBUTION_KINDS)]),
	/** The contributed row's id, or the namespaced configuration key. */
	entityId: z.string(),
	/** What a person calls it: an agent's name, a subscription's name, a document's title. */
	label: z.string(),
	/** Namespaced: "pluginId/manifestKey". */
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

// ---------------------------------------------------------------------------
// search_plugins
// ---------------------------------------------------------------------------

export const SearchPluginsInputSchema = z
	.object({
		ids: z.array(z.string()).optional(),
		state: z.enum(PLUGIN_LIST_STATES).optional(),
		text: z.string().min(1).optional(),
	})
	.strict();
export type SearchPluginsInput = z.infer<typeof SearchPluginsInputSchema>;

export const searchPlugins: ActionDeclaration<SearchPluginsInput, PluginView[]> = {
	name: "search_plugins",
	sentence:
		"Search installed plugins: what is installed, enabled or disabled, and what each one " +
		"contributes. Filter by id, state, or text.",
	input: SearchPluginsInputSchema,
	output: z.array(PluginViewSchema),
};

// ---------------------------------------------------------------------------
// edit_plugin
// ---------------------------------------------------------------------------

/**
 * `plugin-fetch.ts`'s `PluginSource`, `scope` nested inside per source.
 * Deliberately no `ref` field on the `git` arm — the declared contract
 * names only `kind`/`url`/`scope`; a pinned-ref install is a separate,
 * later decision.
 */
export const EditPluginSourceSchema = z.discriminatedUnion("kind", [
	z
		.object({ kind: z.literal("folder"), path: z.string().min(1), scope: PluginScopeSchema })
		.strict(),
	z.object({ kind: z.literal("git"), url: z.string().min(1), scope: PluginScopeSchema }).strict(),
	z.object({ kind: z.literal("zip"), path: z.string().min(1), scope: PluginScopeSchema }).strict(),
]);
export type EditPluginSource = z.infer<typeof EditPluginSourceSchema>;

export const EditPluginInputSchema = z
	.object({
		/** Names the plugin for every change but a source install, which derives its own id. */
		id: z.string().min(1).optional(),
		source: EditPluginSourceSchema.optional(),
		state: z.enum(PLUGIN_LIST_STATES).optional(),
		remove: z.literal(true).optional(),
		/** `contribution` is the namespaced key `search_plugins` returns as `key`. */
		restore: z.object({ contribution: z.string().min(1) }).optional(),
	})
	.strict();
export type EditPluginInput = z.infer<typeof EditPluginInputSchema>;

export const editPlugin: ActionDeclaration<EditPluginInput, PluginView> = {
	name: "edit_plugin",
	sentence:
		"Install, enable, disable, remove or restore a plugin. Give exactly one of: source (install " +
		"— scope for factory or team lives inside it), state (enable or disable), remove, or restore " +
		"(bring back a person's edit of one detached contribution). Name the plugin with id for every " +
		"change but a source install, which derives its own id from the manifest.",
	input: EditPluginInputSchema,
	output: PluginViewSchema,
};

export const PLATFORM_ACTIONS = {
	search_plugins: searchPlugins,
	edit_plugin: editPlugin,
} as const;

// ---------------------------------------------------------------------------
// editPluginInvariants — pure. The four pure invariants declared for
// `edit_plugin`. The DB-dependent ones it also names (`unknown_plugin`, `unknown_contribution`,
// `install_failed`, `plugin_removed`) need the database and run inside
// `edit_plugin.run` (a later task), not here.
// ---------------------------------------------------------------------------

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

	if (input.id === BUILTIN_PLUGIN_ID && (input.remove === true || input.state === "disabled")) {
		problems.push({
			code: "builtin_locked",
			message: "The built-in plugin cannot be disabled or removed.",
			path: "id",
		});
	}

	return problems;
}
