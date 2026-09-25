/**
 * Install a bundled plugin for one team from outside a running server — the
 * demo world's seed is the caller. It runs the same `edit_plugin` install a
 * Settings › Plugins "Install" click runs, over the same composed action list,
 * so a seeded team looks exactly like a team whose person installed the
 * plugin: same install row, same agent ids, same identity documents, same
 * contribution registry.
 *
 * @lore The composition has no orchestration layer behind it. A bundled
 * install reaches orchestration only to put the new agents on a harness, and
 * only when an adapter pool says which harness is ready; none is passed here,
 * so the port is never dialled. Its transport throws rather than answering, so
 * a future install step that does need orchestration fails loudly instead of
 * silently doing nothing. The caller writes any run config it wants itself.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import type { EditPluginInput, PluginView } from "@hyperidle/domain-model";
import { EventBus } from "@hyperidle/event-bus";
import { agentItemId } from "@hyperidle/settings";
import { buildAgentOrchestrationPort } from "../services/agent-orchestration-port-composition.js";
import type { Action } from "./action.js";
import { buildCoreActions } from "./compose.js";

export interface InstallBundledPluginInput {
	/** The plugin's manifest name — a folder under `bundledPluginsDir`. */
	readonly name: string;
	readonly teamId: string;
	/** The folder the bundled plugins ship in (`<repo>/plugins`). */
	readonly bundledPluginsDir: string;
	/** Who installs it — recorded as the actor of the install's document writes. */
	readonly actor: string;
	/** The install's timestamp: the agents' and documents' creation time. */
	readonly now: string;
}

function unreachable(what: string): never {
	throw new Error(
		`installBundledPlugin: ${what} is unreachable — a bundled install never calls it`,
	);
}

export async function installBundledPlugin(
	db: HyperIdleDb,
	input: InstallBundledPluginInput,
): Promise<PluginView> {
	const actions = buildCoreActions({
		agentOrchestration: buildAgentOrchestrationPort(() => unreachable("orchestration")),
		agentWorkIntentRecorder: () => unreachable("the work-intent recorder"),
		reviewVerdictRecorder: () => unreachable("the review-verdict recorder"),
		bundledPluginsDir: input.bundledPluginsDir,
	});
	const editPlugin = actions.find((a) => a.declaration.name === "edit_plugin") as
		| Action<EditPluginInput, PluginView>
		| undefined;
	if (!editPlugin)
		throw new Error("installBundledPlugin: the composed actions have no edit_plugin");

	const result = await editPlugin.run(
		{ actor: input.actor, db, eventBus: new EventBus(), now: input.now, internal: true },
		{
			source: {
				kind: "bundled",
				name: input.name,
				scope: { kind: "team", teamId: input.teamId },
			},
		},
	);
	if (!result.ok) {
		const reasons = result.problems.map((p) => p.message).join("; ");
		throw new Error(`installBundledPlugin: installing "${input.name}" failed: ${reasons}`);
	}
	return result.data;
}

/** The id the installer gives an agent a plugin brings to a team. */
export function teamPluginAgentId(pluginName: string, agentId: string, teamId: string): string {
	return agentItemId(pluginName, agentId, "team", teamId);
}
