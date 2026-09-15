/**
 * The layer's own composition for the action mechanism: wires
 * `@hyperidle/task`'s `createTaskActions` deps to the real Services, and
 * returns the ONE composed list every projection (HTTP, MCP, UI) reads.
 * the architecture doc §5, §7.
 */
import type { AgentOrchestrationPort } from "@hyperidle/api-contract";
import { appendChange } from "@hyperidle/changes";
import { get as getKnowledgeItem, listItemIdsByParent } from "@hyperidle/knowledge";
import { getTeam } from "@hyperidle/org";
import { createTaskActions, type TaskActionsDeps } from "@hyperidle/task";
import { findUser } from "@hyperidle/users";
import { taskRunResolverDeps } from "../services/task-run-resolver-bindings.js";
import type { Action } from "./action.js";

function buildTaskActionsDeps(agentOrchestration: AgentOrchestrationPort): TaskActionsDeps {
	return {
		changes: { appendChange },
		agentOrchestration: {
			submitWorkIntent: async (input) => {
				await agentOrchestration.intents.submit(input);
			},
			stopRunsForTasks: (taskIds) => agentOrchestration.runs.stopForTasks(taskIds),
			endRunForHandoff: (sessionId, endedAt) =>
				agentOrchestration.runs.endForHandoff(sessionId, endedAt),
		},
		org: { getTeam: (exec, q) => getTeam(exec, q) },
		users: { getUserById: (exec, id) => findUser(exec, { id }) },
		knowledge: {
			listItemIdsByParent: (db, q) => listItemIdsByParent(db, q),
			getItemById: async (exec, id) => {
				const item = await getKnowledgeItem(exec, id);
				return item ? { id: item.id } : null;
			},
		},
		taskRunResolver: taskRunResolverDeps,
	};
}

/**
 * `buildCoreActions` — the composed `readonly Action[]` every loop (HTTP
 * router, MCP tool adapter, the UI's `call()`, the governance rule) reads.
 * Grows per item; seeds it with task's three.
 */
export function buildCoreActions(agentOrchestration: AgentOrchestrationPort): readonly Action[] {
	return [...createTaskActions(buildTaskActionsDeps(agentOrchestration))];
}
