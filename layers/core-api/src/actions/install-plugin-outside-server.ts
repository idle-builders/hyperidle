/**
 * Install a plugin from outside a running server — the demo world's seed is the
 * caller. It runs the same `edit_plugin` install a person's "Add a plugin" runs,
 * over the same composed action list, so a seeded install looks exactly like
 * one a person made: same install row, same agent ids, same identity documents,
 * same contribution registry.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import type {
	EditPluginInput,
	EditPluginSource,
	PluginScope,
	PluginView,
} from "@hyperidle/domain-model";
import { EventBus } from "@hyperidle/event-bus";
import { agentItemId } from "@hyperidle/settings";
import { buildAgentOrchestrationPort } from "../services/agent-orchestration-port-composition.js";
import type { Action } from "./action.js";
import { buildCoreActions } from "./compose.js";

export interface InstallPluginOutsideServerInput {
	/** Where the plugin comes from, and the scope it is installed for. */
	readonly source: EditPluginSource;
	/** Who installs it — recorded as the actor of the install's document writes. */
	readonly actor: string;
	/** The install's timestamp: the agents' and documents' creation time. */
	readonly now: string;
}

function unreachable(what: string): never {
	throw new Error(`installPluginOutsideServer: ${what} is unreachable — an install never calls it`);
}

export async function installPluginOutsideServer(
	db: HyperIdleDb,
	input: InstallPluginOutsideServerInput,
): Promise<PluginView> {
	const actions = buildCoreActions({
		agentOrchestration: buildAgentOrchestrationPort(() => unreachable("orchestration")),
		agentWorkIntentRecorder: () => unreachable("the work-intent recorder"),
		reviewVerdictRecorder: () => unreachable("the review-verdict recorder"),
	});
	const editPlugin = actions.find((a) => a.declaration.name === "edit_plugin") as
		| Action<EditPluginInput, PluginView>
		| undefined;
	if (!editPlugin)
		throw new Error("installPluginOutsideServer: the composed actions have no edit_plugin");

	const result = await editPlugin.run(
		{ actor: input.actor, db, eventBus: new EventBus(), now: input.now, internal: true },
		{ source: input.source },
	);
	if (!result.ok) {
		const reasons = result.problems.map((p) => p.message).join("; ");
		throw new Error(`installPluginOutsideServer: the install failed: ${reasons}`);
	}
	return result.data;
}

/** The id the installer gives an agent a plugin brings to a scope. */
export function pluginAgentId(pluginName: string, agentId: string, scope: PluginScope): string {
	return agentItemId(pluginName, agentId, scope.kind, scope.teamId);
}
