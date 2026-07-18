/**
 * @lore AU20 Ab4: module-level singleton for `agent-selection` — the single
 * authoritative `AgentSelectionService` instance at the composition root.
 * Routes (`users.ts`, `assistant.ts`, `teams-routes.ts`) and tool-handlers
 * call `agentSelectionService.resolveScaffoldSpecs(...)` (method on the
 * service object) rather than the removed loose barrel function.
 * `server-factory.ts` also imports this instance to wire `work`'s
 * `AgentSelectionDefaults` port, replacing the duplicate local creation.
 *
 * Deps wired identically to the former `server-factory.ts` local creation
 * (lines 262-265 pre-Ab4): `users → @hyperidle/users`, `teams → @hyperidle/org`.
 */

import {
	type AgentSelectionService,
	createAgentSelectionService,
} from "@hyperidle/agent-selection";
import { getTeamMembers } from "@hyperidle/org";
import { findUser, listUsers } from "@hyperidle/users";

export const agentSelectionService: AgentSelectionService = createAgentSelectionService({
	users: {
		getUserById: (db, id) => findUser(db, { id }),
		listActiveAiUsersByTeams: (db, teamIds) =>
			listUsers(db, { teamIds, kind: "ai", status: "active" }),
	},
	teams: { getTeamMembersByTeamId: (db, teamId) => getTeamMembers(db, { teamId }) },
});
